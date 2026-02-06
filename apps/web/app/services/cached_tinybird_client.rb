# frozen_string_literal: true

class CachedTinybirdClient
  PUBLIC_TTL = 24.hours
  AUTHENTICATED_TTL = 15.minutes
  RACE_CONDITION_TTL = 30.seconds

  def self.query(pipe:, params: {}, public_mode: false)
    ttl = public_mode ? PUBLIC_TTL : AUTHENTICATED_TTL
    cache_key = build_cache_key(pipe, params)

    Rails.cache.fetch(cache_key, expires_in: ttl, race_condition_ttl: RACE_CONDITION_TTL) do
      TinybirdClient.query(pipe: pipe, params: params)
    end
  end

  private_class_method def self.build_cache_key(pipe, params)
    project_id = params[:project_id]
    filter_params = params.except(:project_id).sort.to_h
    params_hash = Digest::SHA256.hexdigest(filter_params.to_json)[0..15]
    "tinybird:#{project_id}:#{pipe}:#{params_hash}"
  end
end
