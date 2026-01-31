# frozen_string_literal: true

module PrefixIdSerialization
  extend ActiveSupport::Concern

  # Convert internal IDs to prefix_ids in response objects
  # This ensures we never expose internal database IDs in API responses

  def serialize_record(record, options = {})
    return nil if record.nil?

    data = record.as_json(options)
    data = data.with_indifferent_access

    # Replace id with prefix_id
    if record.respond_to?(:prefix_id) && record.prefix_id.present?
      data[:id] = record.prefix_id
    end

    # Convert foreign key references
    convert_foreign_keys(data, record)

    data
  end

  def serialize_collection(records, options = {})
    records.map { |record| serialize_record(record, options) }
  end

  private

  def convert_foreign_keys(data, record)
    # Common foreign key patterns
    foreign_key_patterns = %w[
      user_id project_id website_id plan_id
    ]

    foreign_key_patterns.each do |fk|
      next unless data.key?(fk)

      # Try to find the associated record and get its prefix_id
      association_name = fk.sub(/_id$/, "")
      if record.respond_to?(association_name)
        associated = record.send(association_name)
        if associated.respond_to?(:prefix_id) && associated.prefix_id.present?
          data[fk] = associated.prefix_id
        end
      end
    end
  end
end
