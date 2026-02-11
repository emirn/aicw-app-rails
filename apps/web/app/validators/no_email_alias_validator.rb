# frozen_string_literal: true

class NoEmailAliasValidator < ActiveModel::EachValidator
  # Rejects emails with plus-addressing aliases (e.g. user+tag@gmail.com).
  # Plus addressing is supported by Gmail, Outlook, ProtonMail, Fastmail,
  # iCloud, Zoho, Hey.com, and others.
  # Yahoo uses "-" as delimiter but we skip that — it's indistinguishable
  # from legitimate hyphenated local parts.
  PLUS_ALIAS_PATTERN = /\+[^@]+@/

  def validate_each(record, attribute, value)
    return if value.blank?

    if value.match?(PLUS_ALIAS_PATTERN)
      record.errors.add(attribute, options[:message] || "cannot contain a plus-address alias (e.g. user+tag@example.com)")
    end
  end
end
