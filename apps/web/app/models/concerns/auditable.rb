# frozen_string_literal: true

module Auditable
  extend ActiveSupport::Concern

  included do
    after_create_commit :log_create
    after_update_commit :log_update
    after_destroy_commit :log_destroy
  end

  private

  def log_create
    AuditLog.log("#{audit_action_prefix}.created", auditable: self)
  end

  def log_update
    changes = previous_changes.except("updated_at", "created_at")
    return if changes.empty?

    AuditLog.log(
      "#{audit_action_prefix}.updated",
      auditable: self,
      metadata: { changes: changes }
    )
  end

  def log_destroy
    AuditLog.log(
      "#{audit_action_prefix}.destroyed",
      auditable: self,
      metadata: { record: audit_destroy_metadata }
    )
  end

  def audit_action_prefix
    self.class.name.underscore.tr("/", ".")
  end

  def audit_destroy_metadata
    { id: id }
  end
end
