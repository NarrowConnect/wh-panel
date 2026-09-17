-- Meta Data Deletion Request Callback compliance log.
-- Not tenant-scoped: these requests come from Meta (Facebook user removing the app)
-- or from the public data-deletion form, neither of which is tied to a company_id.
CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meta_user_id VARCHAR(255),
    contact_identifier VARCHAR(255),
    source VARCHAR(30) NOT NULL DEFAULT 'meta_callback', -- meta_callback, manual_form
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, completed, rejected
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_data_deletion_requests_status ON data_deletion_requests(status);
