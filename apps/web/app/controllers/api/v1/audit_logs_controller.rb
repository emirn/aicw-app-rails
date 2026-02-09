# frozen_string_literal: true

class Api::V1::AuditLogsController < Api::BaseController
  # GET /api/v1/audit_logs
  def index
    unless current_account_user&.admin?
      render_api_forbidden("Only admins can view audit logs")
      return
    end

    logs = AuditLog.recent.includes(:user)

    logs = logs.by_action(params[:action_filter]) if params[:action_filter].present?
    logs = logs.by_user(User.find_by_prefix_id!(params[:user_id])) if params[:user_id].present?

    limit = [params[:limit]&.to_i || 50, 200].min
    offset = params[:offset]&.to_i || 0

    render_api_success(
      audit_logs: logs.offset(offset).limit(limit).map { |log| audit_log_json(log) },
      meta: { total: logs.count, limit: limit, offset: offset }
    )
  end

  private

  def audit_log_json(log)
    {
      id: log.prefix_id,
      action: log.action,
      user: {
        id: log.user.prefix_id,
        name: log.user.name,
        email: log.user.email
      },
      auditable_type: log.auditable_type,
      auditable_id: log.auditable_id,
      metadata: log.metadata,
      request_id: log.request_id,
      ip_address: log.ip_address,
      created_at: log.created_at
    }
  end
end
