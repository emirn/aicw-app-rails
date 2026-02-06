#!/usr/bin/env python3
"""
Convert DB-IP City Lite CSV to PostgreSQL-ready format

Converts IP ranges to CIDR notation for efficient inet type queries
Maps country codes to full names
Handles both IPv4 and IPv6 addresses
Outputs both split CSV parts and a single merged CSV file

Usage:
    python3 convert-dbip-to-postgres.py --input INPUT.csv.gz [--output OUTPUT_DIR] [--max-size 90]
"""

import csv
import gzip
import ipaddress
import argparse
import sys
import os
from typing import List

# ISO 3166-1 alpha-2 country code to name mapping (abbreviated for common countries)
def load_country_names(csv_path: str) -> dict:
    """
    Load country code to name mapping from a CSV file.
    The CSV should have a header and be in the form: CountryName,CountryCode

    Args:
        csv_path: Path to the countries CSV file

    Returns:
        Dictionary mapping country code (uppercased) to country name
    """
    mapping = {}
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row.get('Code')
            name = row.get('Name')
            if code and name:
                mapping[code.strip().upper()] = name.strip()
    return mapping

# Set this file path as needed, e.g., relative to script or absolute path
COUNTRY_CSV_PATH = os.path.join(os.path.dirname(__file__), "data/countries-with-codes.csv")
COUNTRY_NAMES = load_country_names(COUNTRY_CSV_PATH)


def ip_range_to_cidrs(start_ip: str, end_ip: str) -> List[str]:
    """
    Convert IP range to list of CIDR blocks

    Args:
        start_ip: First IP in range (e.g., "1.0.0.0")
        end_ip: Last IP in range (e.g., "1.0.0.255")

    Returns:
        List of CIDR strings (e.g., ["1.0.0.0/24"])
    """
    try:
        start = ipaddress.ip_address(start_ip)
        end = ipaddress.ip_address(end_ip)

        # Summarize address range into CIDR blocks
        cidrs = list(ipaddress.summarize_address_range(start, end))
        return [str(cidr) for cidr in cidrs]
    except (ValueError, ipaddress.AddressValueError) as e:
        print(f"Warning: Invalid IP range {start_ip}-{end_ip}: {e}", file=sys.stderr)
        return []


def get_country_name(country_code: str) -> str:
    """Get full country name from ISO code, fallback to code if not found"""
    return COUNTRY_NAMES.get(country_code.upper(), country_code)


def process_csv(input_path: str, output_dir: str, max_size_mb: int = 90):
    """
    Convert DB-IP CSV to PostgreSQL format, saving as multiple CSV parts and one merged file

    Input format: ip_start,ip_end,continent,country,stateprov,city
    Output format: network,continent_code,country_code,country_name,region_name,city_name

    Args:
        input_path: Input CSV file path
        output_dir: Output directory for CSV files
        max_size_mb: Maximum size per CSV part in MB (default 90MB)
    """
    # Determine if input is gzipped
    open_func = gzip.open if input_path.endswith('.gz') else open

    row_count = 0
    output_count = 0
    error_count = 0
    file_count = 1
    current_file_size = 0
    max_size_bytes = max_size_mb * 1024 * 1024

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    csv_files = []

    print(f"Converting {input_path} → {output_dir}")
    print(f"Max size per CSV part: {max_size_mb} MB")
    print("This may take 2-5 minutes for large files...")

    def get_csv_path(part_num):
        """Generate CSV path for given part number"""
        return os.path.join(output_dir, f"part{part_num}.csv")

    def open_new_file(part_num):
        """Open a new CSV file and write header"""
        nonlocal current_file_size
        path = get_csv_path(part_num)
        csv_files.append(path)

        outfile = open(path, 'w', encoding='utf-8', newline='')
        writer = csv.writer(outfile)

        # Write header only for part1
        if part_num == 1:
            writer.writerow([
                'network',
                'continent_code',
                'country_code',
                'country_name',
                'region_name',
                'city_name'
            ])

        current_file_size = 0
        print(f"\n📝 Writing to: part{part_num}.csv")
        return outfile, writer

    # Open first file
    outfile, writer = open_new_file(file_count)

    try:
        with open_func(input_path, 'rt', encoding='utf-8') as infile:
            # DB-IP CSV has NO header row, define field names manually
            fieldnames = ['ip_start', 'ip_end', 'continent', 'country', 'stateprov', 'city']
            reader = csv.DictReader(infile, fieldnames=fieldnames)

            for row in reader:
                row_count += 1

                # Progress indicator
                if row_count % 100000 == 0:
                    print(f"Processed {row_count:,} rows, output {output_count:,} rows, file {file_count}...")

                # Convert IP range to CIDR blocks
                cidrs = ip_range_to_cidrs(row['ip_start'], row['ip_end'])

                if not cidrs:
                    error_count += 1
                    continue

                # Get values, handling empty strings
                continent_code = row.get('continent', '')[:2] if row.get('continent') else ''
                country_code = row.get('country', '').upper()
                country_name = get_country_name(country_code) if country_code else ''
                region_name = row.get('stateprov', '') or None
                city_name = row.get('city', '') or None

                # Write one row per CIDR block
                for cidr in cidrs:
                    row_data = [
                        cidr,
                        continent_code,
                        country_code,
                        country_name,
                        region_name,
                        city_name
                    ]

                    writer.writerow(row_data)
                    output_count += 1

                    # Estimate row size (approximate)
                    row_size = sum(len(str(x)) if x else 0 for x in row_data) + 10  # +10 for commas/newline
                    current_file_size += row_size

                    # Check if we need to start a new file
                    if current_file_size >= max_size_bytes:
                        outfile.close()
                        file_count += 1
                        outfile, writer = open_new_file(file_count)

    finally:
        outfile.close()

    # Create single merged CSV for fast psql import
    single_csv_path = os.path.join(output_dir, 'dbip-full.csv')
    print(f"\n📄 Creating single merged CSV: {single_csv_path}")

    with open(single_csv_path, 'w', encoding='utf-8', newline='') as merged_file:
        writer = csv.writer(merged_file)

        # Write header from part1
        with open(csv_files[0], 'r', encoding='utf-8') as part1:
            reader = csv.reader(part1)
            header = next(reader)
            writer.writerow(header)

            # Write rest of part1
            for row in reader:
                writer.writerow(row)

        # Write all other parts (skip their non-existent headers)
        for csv_file in csv_files[1:]:
            with open(csv_file, 'r', encoding='utf-8') as partfile:
                reader = csv.reader(partfile)
                for row in reader:
                    writer.writerow(row)

    single_csv_size_mb = os.path.getsize(single_csv_path) / (1024 * 1024)
    
    # Calculate total size of part files
    parts_total_size_mb = sum(os.path.getsize(f) for f in csv_files) / (1024 * 1024)

    print(f"\n✅ Conversion complete!")
    print(f"   Input rows: {row_count:,}")
    print(f"   Output rows: {output_count:,}")
    print(f"   Errors: {error_count:,}")
    print(f"\n   📦 CSV Parts: {file_count} files")
    print(f"      Location: {output_dir}")
    print(f"      Files: part1.csv to part{file_count}.csv")
    print(f"      Total size: {parts_total_size_mb:.1f} MB")
    print(f"\n   📄 Single merged CSV (for psql \\copy): {single_csv_path}")
    print(f"      Size: {single_csv_size_mb:.1f} MB")
    print(f"\n   💡 PostgreSQL Import:")
    print(f"      \\copy ip_locations(network,continent_code,country_code,country_name,region_name,city_name)")
    print(f"      FROM '{single_csv_path}' WITH (FORMAT csv, HEADER true);")

    return {'parts': csv_files, 'merged': single_csv_path}


def main():
    parser = argparse.ArgumentParser(
        description='Convert DB-IP CSV to PostgreSQL-ready format as CSV files'
    )
    parser.add_argument(
        '--input',
        required=True,
        help='Input DB-IP CSV file (can be .csv or .csv.gz)'
    )
    parser.add_argument(
        '--output',
        default=None,
        help='Output directory for CSV files (default: data/ip-to-location/.temp/)'
    )
    parser.add_argument(
        '--max-size',
        type=int,
        default=90,
        help='Maximum size per CSV part in MB (default: 90)'
    )

    args = parser.parse_args()

    # Set default output directory relative to script location
    if args.output is None:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        args.output = os.path.join(script_dir, 'data/ip-to-location/.temp')

    try:
        process_csv(args.input, args.output, args.max_size)
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
