# frozen_string_literal: true

class PlanParserService
  ParseResult = Struct.new(:items, :parsed, :skipped, :warnings, keyword_init: true)
  PlanItem = Struct.new(:title, :slug, :description, :keywords, :published_at, keyword_init: true)

  def self.call(content)
    new(content).call
  end

  def initialize(content)
    @content = content
  end

  def call
    blocks = @content.split(/\n-{3,}\n/).map(&:strip).reject(&:blank?)

    items = []
    warnings = []

    blocks.each_with_index do |block, index|
      result = parse_block(block, index)
      if result[:item]
        items << result[:item]
      else
        warnings << { block_index: index + 1, reason: result[:reason] }
      end
    end

    ParseResult.new(
      items: items,
      parsed: items.size,
      skipped: warnings.size,
      warnings: warnings
    )
  end

  private

  def parse_block(block, index)
    title = extract_field(block, 'TITLE')
    url = extract_field(block, 'URL')
    description = extract_description(block)
    date = extract_field(block, 'DATE')
    keywords = extract_field(block, 'KEYWORDS')

    # Validate required fields
    missing = []
    missing << 'TITLE' if title.blank?
    missing << 'URL' if url.blank?
    missing << 'DESCRIPTION' if description.blank?

    return { item: nil, reason: "Missing #{missing.join(', ')}" } if missing.any?

    # Validate date format if provided
    if date.present? && !valid_date?(date)
      return { item: nil, reason: "Invalid DATE format (expected YYYY-MM-DD)" }
    end

    {
      item: PlanItem.new(
        title: title.strip,
        slug: url.strip.sub(%r{^/}, ''),  # Remove leading slash
        description: description.strip,
        keywords: keywords.present? ? keywords.split(',').map(&:strip).reject(&:blank?) : [],
        published_at: date&.strip
      )
    }
  end

  def extract_field(block, field_name)
    match = block.match(/^#{field_name}:\s*(.+)$/i)
    match&.[](1)&.strip
  end

  def extract_description(block)
    # Find DESCRIPTION: and get everything after it
    index = block.downcase.index('description:')
    return '' unless index

    block[(index + 'description:'.length)..].strip
  end

  def valid_date?(date_str)
    date_str.match?(/^\d{4}-\d{2}-\d{2}$/)
  end
end
