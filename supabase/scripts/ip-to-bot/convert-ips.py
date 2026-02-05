#!/usr/bin/env python3
"""Convert bot IP range JSON files to simple CSV format (network, bot_name)"""

import json
import csv
import glob
import gzip
import ipaddress
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BOT_SOURCES = os.path.join(SCRIPT_DIR, '../../../supabase/functions/_shared/bot-sources.json')
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
CRAWLER_IPS_DIR = os.path.join(DATA_DIR, 'crawler-ips')
OUTPUT_FILE = os.path.join(DATA_DIR, 'crawler-ips.csv')

def parse_ip_ranges(data):
    """Extract IP ranges from JSON (handles OpenAI/Perplexity/CommonCrawl format)"""
    ranges = []
    prefixes = data.get('prefixes', [])

    for entry in prefixes:
        if isinstance(entry, str):
            ranges.append(entry)
        elif isinstance(entry, dict):
            if 'ipv4Prefix' in entry:
                ranges.append(entry['ipv4Prefix'])
            if 'ipv6Prefix' in entry:
                ranges.append(entry['ipv6Prefix'])

    return ranges

def validate_cidr(cidr):
    """Validate CIDR notation"""
    try:
        ipaddress.ip_network(cidr)
        return True
    except ValueError:
        return False

def load_json_file(filepath):
    """Load JSON file, automatically handling gzip compression"""
    # Check if file is gzip-compressed by reading magic bytes
    with open(filepath, 'rb') as f:
        magic = f.read(2)

    # gzip files start with 0x1f 0x8b
    if magic == b'\x1f\x8b':
        with gzip.open(filepath, 'rt', encoding='utf-8') as f:
            return json.load(f)
    else:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)

def main():
    # Load bot sources to map filenames to bot names
    with open(BOT_SOURCES) as f:
        bots = json.load(f)

    # Create filename -> bot name mapping
    bot_map = {}
    for bot in bots:
        if bot.get('ip_ranges_url'):
            filename = bot['name'].replace(' ', '-').lower() + '.json'
            bot_map[filename] = bot['name']

    print(f"Converting IP ranges to CSV...")
    print(f"Reading from: {CRAWLER_IPS_DIR}")

    # Process all JSON files
    all_rows = []
    stats = {}

    for json_file in glob.glob(os.path.join(CRAWLER_IPS_DIR, '*.json')):
        filename = os.path.basename(json_file)
        bot_name = bot_map.get(filename)

        if not bot_name:
            print(f"⚠ Skipping {filename} (not in bot-sources.json)")
            continue

        try:
            data = load_json_file(json_file)
        except Exception as e:
            print(f"✗ Error loading {filename}: {e}")
            continue

        ranges = parse_ip_ranges(data)
        valid_ranges = [r for r in ranges if validate_cidr(r)]

        for ip_range in valid_ranges:
            all_rows.append({'network': ip_range, 'bot_name': bot_name})

        stats[bot_name] = len(valid_ranges)
        print(f"✓ {bot_name}: {len(valid_ranges)} ranges")

    # Write CSV
    with open(OUTPUT_FILE, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['network', 'bot_name'])
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\n✓ Wrote {len(all_rows)} IP ranges to {OUTPUT_FILE}")
    print(f"\nBreakdown by bot:")
    for bot, count in sorted(stats.items()):
        print(f"  {bot}: {count}")

if __name__ == '__main__':
    main()
