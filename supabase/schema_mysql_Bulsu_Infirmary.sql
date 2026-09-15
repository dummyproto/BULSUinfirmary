-- =====================================================================
-- MySQL-compatible conversion of complete_schema_1_.sql
-- Converted from PostgreSQL 17 (Supabase) dump.
--
-- IMPORTANT — things that do NOT translate 1:1 to MySQL, read before use:
--
-- 1. Row Level Security (RLS) / GRANT statements / Supabase roles
--    (anon, authenticated, service_role) have NO MySQL equivalent and
--    have been dropped entirely. Access control must be enforced in
--    your application layer instead.
--
-- 2. auth.uid() / auth.email() (Supabase Auth session context) do not
--    exist in MySQL. Any function that relied on them
--    (current_app_role, current_app_user_id, has_own_pin, clear_own_pin,
--    set_own_pin, link_current_auth_user) has been rewritten to accept
--    the acting user's id/email as an explicit parameter — your
--    application must pass it in.
--
-- 3. pgcrypto's crypt()/gen_salt('bf') (bcrypt) has no built-in MySQL
--    equivalent. PIN hashing/verification (set_own_pin, verify_pin_hash)
--    should be done in application code (e.g. bcrypt in Node/PHP/Python)
--    — the procedures below accept an already-hashed value instead.
--
-- 4. uuid -> CHAR(36); jsonb -> JSON; boolean -> TINYINT(1)/BOOLEAN;
--    timestamptz -> DATETIME (assumes the app stores UTC, since MySQL's
--    DATETIME has no timezone); numeric(p,s) -> DECIMAL(p,s).
--
-- 5. PostgreSQL sequences are replaced with AUTO_INCREMENT columns.
--
-- 6. Requires MySQL 8.0.16+ (CHECK constraints) / 8.0.13+ (functional
--    indexes, TEXT/BLOB column defaults). InnoDB engine assumed
--    throughout for foreign key support.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- =====================================================================
-- TABLES
-- =====================================================================

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(10) NOT NULL,
    name VARCHAR(150) NOT NULL,
    avatar_initials VARCHAR(5),
    profile_img_url TEXT,
    phone VARCHAR(20),
    school_id_barcode VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auth_user_id CHAR(36),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    -- pin_hash: bcrypt hash of the account's 4-digit quick-login PIN.
    -- Hash/verify this in application code (see notes above); never
    -- include in normal SELECTs, only via set_own_pin()/clear_own_pin().
    pin_hash TEXT,
    pin_attempts INT NOT NULL DEFAULT 0,
    pin_locked_until DATETIME NULL,
    CONSTRAINT users_role_check CHECK (role IN ('admin', 'staff', 'patient')),
    CONSTRAINT users_username_key UNIQUE (username),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_school_id_barcode_key UNIQUE (school_id_barcode),
    CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE suppliers (
    supplier_id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(20),
    email VARCHAR(150),
    address VARCHAR(255),
    remarks TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
    audit_log_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(50) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_name VARCHAR(150),
    actor_role VARCHAR(10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE chat_conversations (
    conversation_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role VARCHAR(10) NOT NULL,
    title VARCHAR(150),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_conversations_role_check CHECK (role IN ('admin', 'staff', 'patient'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE chat_messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_type VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'sent',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_messages_sender_type_check CHECK (sender_type IN ('user', 'bot')),
    CONSTRAINT chat_messages_status_check CHECK (status IN ('sent', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE consultations (
    consultation_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NULL,
    visit_type VARCHAR(20) NOT NULL,
    chief_complaint TEXT,
    bp VARCHAR(15),
    temp_celsius DECIMAL(4,1),
    pulse_bpm SMALLINT,
    o2_sat_pct SMALLINT,
    diagnosis VARCHAR(150),
    assessment TEXT,
    medications TEXT,
    attended_by INT NULL,
    visit_date DATE NOT NULL,
    follow_up_date DATE,
    follow_up_notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unregistered_patient_name TEXT,
    CONSTRAINT consultations_visit_type_check CHECK (visit_type IN ('Walk-in', 'Appointment', 'Emergency')),
    CONSTRAINT consultations_patient_identity_check CHECK (
        (patient_id IS NOT NULL) OR (unregistered_patient_name IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE consultation_medications (
    consultation_medication_id INT AUTO_INCREMENT PRIMARY KEY,
    consultation_id INT NOT NULL,
    inventory_id INT NULL,
    item_name VARCHAR(150) NOT NULL,
    quantity INT NOT NULL,
    dosage_instructions VARCHAR(255),
    medicine_id INT NULL,
    medicine_batch_id INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE diagnoses (
    diagnosis_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'Other',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT diagnoses_name_key UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE document_requests (
    doc_request_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NULL,
    doc_type VARCHAR(100) NOT NULL,
    purpose VARCHAR(255),
    date_requested DATE NOT NULL,
    date_needed DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    processed_by INT NULL,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    CONSTRAINT document_requests_status_check CHECK (
        status IN ('Pending', 'Processing', 'Approved', 'Declined', 'Claimed', 'Cancelled')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE email_config (
    email_config_id INT AUTO_INCREMENT PRIMARY KEY,
    smtp_host VARCHAR(150) NOT NULL,
    smtp_port INT NOT NULL,
    smtp_user VARCHAR(150) NOT NULL,
    from_name VARCHAR(150) NOT NULL,
    enable_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE emergency_alerts (
    emergency_alert_id INT AUTO_INCREMENT PRIMARY KEY,
    reported_by INT NULL,
    subject_id INT NULL,
    subject_student_num VARCHAR(20),
    subject_name VARCHAR(150),
    emergency_type VARCHAR(10) NOT NULL,
    location VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(15) NOT NULL DEFAULT 'Active',
    acknowledged_by INT NULL,
    sms_sent BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT emergency_alerts_emergency_type_check CHECK (emergency_type IN ('myself', 'another')),
    CONSTRAINT emergency_alerts_status_check CHECK (status IN ('Active', 'Acknowledged', 'Resolved'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE equipment (
    equipment_id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_name VARCHAR(150) NOT NULL,
    description TEXT,
    image_url TEXT,
    unit VARCHAR(30) NOT NULL DEFAULT 'Units',
    min_stock INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    legacy_inventory_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE equipment_batches (
    equipment_batch_id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT NOT NULL,
    batch_number VARCHAR(50) NOT NULL,
    supplier_id INT NULL,
    received_date DATE,
    expiration_date DATE,
    quantity INT NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2),
    purchase_reference VARCHAR(100),
    needs_maintenance BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    legacy_batch_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    CONSTRAINT equipment_batches_status_check CHECK (
        status IN ('Active', 'Depleted', 'Expired', 'Recalled', 'On Hold')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory (
    inventory_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(20) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    unit VARCHAR(30) NOT NULL,
    min_stock INT NOT NULL DEFAULT 0,
    expiration_date DATE,
    received_date DATE,
    is_fifo BOOLEAN NOT NULL DEFAULT FALSE,
    batch_no VARCHAR(50),
    supplier VARCHAR(150),
    needs_maintenance BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    -- image_url: Base64 data URL of the item photo, optional. Same
    -- storage approach as medicines.image_url / users.profile_img_url.
    image_url TEXT,
    CONSTRAINT inventory_category_check CHECK (category IN ('Medicine', 'Supply', 'Equipment'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory_batches (
    batch_id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_id INT NOT NULL,
    batch_code VARCHAR(50) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    expiration_date DATE,
    received_date DATE,
    supplier VARCHAR(150),
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventory_batches_uniq UNIQUE (inventory_id, batch_code, expiration_date, received_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE medicines (
    medicine_id INT AUTO_INCREMENT PRIMARY KEY,
    medicine_name VARCHAR(150) NOT NULL,
    generic_name VARCHAR(150),
    brand_name VARCHAR(150),
    dosage VARCHAR(50),
    strength VARCHAR(50),
    form VARCHAR(50),
    category VARCHAR(50),
    storage_requirement VARCHAR(150),
    description TEXT,
    image_url TEXT,
    unit VARCHAR(30) NOT NULL DEFAULT 'Units',
    min_stock INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    legacy_inventory_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE medicine_batches (
    medicine_batch_id INT AUTO_INCREMENT PRIMARY KEY,
    medicine_id INT NOT NULL,
    batch_number VARCHAR(50) NOT NULL,
    lot_number VARCHAR(50),
    supplier_id INT NULL,
    received_date DATE,
    expiration_date DATE,
    quantity INT NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2),
    purchase_reference VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    legacy_batch_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    CONSTRAINT medicine_batches_status_check CHECK (
        status IN ('Active', 'Depleted', 'Expired', 'Recalled', 'On Hold', 'Archived', 'Damaged')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory_logs (
    inventory_log_id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_id INT NULL,
    batch_id INT NULL,
    consultation_id INT NULL,
    action_type VARCHAR(20) NOT NULL,
    quantity_change INT NOT NULL,
    previous_quantity INT,
    new_quantity INT,
    staff_id INT NULL,
    log_date DATE NOT NULL,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    medicine_id INT NULL,
    medicine_batch_id INT NULL,
    supply_id INT NULL,
    supply_batch_id INT NULL,
    equipment_id INT NULL,
    equipment_batch_id INT NULL,
    staff_name_snapshot VARCHAR(150),
    staff_role_snapshot VARCHAR(10),
    CONSTRAINT inventory_logs_action_type_check CHECK (action_type IN (
        'Received', 'Released', 'Adjustment', 'Damaged', 'Expired', 'Archived',
        'Replenish', 'Release', 'Edit', 'Merge', 'Remove Expired', 'Removed',
        'Maintained', 'Maintenance Hold'
    )),
    CONSTRAINT inventory_logs_has_subject CHECK (
        (inventory_id IS NOT NULL) OR (medicine_id IS NOT NULL)
        OR (equipment_id IS NOT NULL) OR (supply_id IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE inventory_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    notification_type VARCHAR(30) NOT NULL,
    medicine_id INT NULL,
    batch_id INT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'medium',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INT NULL,
    CONSTRAINT inventory_notifications_notification_type_check CHECK (notification_type IN (
        'low_stock', 'critical_stock', 'out_of_stock', 'expiring_90', 'expiring_60',
        'expiring_30', 'expiring_7', 'expired', 'received', 'released', 'damaged',
        'adjustment', 'archived'
    )),
    CONSTRAINT inventory_notifications_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    target_role VARCHAR(10),
    message TEXT NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'info',
    module VARCHAR(30),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notifications_target_role_check CHECK (target_role IN ('admin', 'staff', 'patient')),
    CONSTRAINT notifications_type_check CHECK (type IN ('info', 'success', 'warning', 'danger')),
    CONSTRAINT notifications_check CHECK ((user_id IS NOT NULL) OR (target_role IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE patient_profiles (
    user_id INT PRIMARY KEY,
    student_number VARCHAR(20) NOT NULL,
    surname VARCHAR(100) NOT NULL,
    given_name VARCHAR(100) NOT NULL,
    middle_initial VARCHAR(5),
    suffix VARCHAR(10),
    course VARCHAR(150),
    year_level VARCHAR(20),
    date_of_birth DATE,
    birth_place VARCHAR(150),
    gender VARCHAR(20),
    civil_status VARCHAR(20),
    religion VARCHAR(50),
    nationality VARCHAR(50),
    blood_type VARCHAR(5),
    parent_name VARCHAR(150),
    parent_phone VARCHAR(20),
    parent_phone_2 VARCHAR(20),
    parent_relation VARCHAR(30),
    guardian_address VARCHAR(255),
    father_name VARCHAR(150),
    father_phone VARCHAR(20),
    father_address VARCHAR(255),
    mother_name VARCHAR(150),
    mother_phone VARCHAR(20),
    mother_address VARCHAR(255),
    addr_region VARCHAR(100),
    addr_province VARCHAR(100),
    addr_city VARCHAR(100),
    addr_barangay VARCHAR(100),
    addr_zip VARCHAR(10),
    profile_incomplete BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT patient_profiles_student_number_key UNIQUE (student_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receiving_records (
    receiving_record_id INT AUTO_INCREMENT PRIMARY KEY,
    medicine_id INT NOT NULL,
    medicine_batch_id INT NOT NULL,
    supplier_id INT NULL,
    invoice_number VARCHAR(100),
    purchase_reference VARCHAR(100),
    quantity INT NOT NULL,
    received_date DATE NOT NULL,
    received_by INT NULL,
    remarks TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    CONSTRAINT receiving_records_quantity_check CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- registration_qr_codes.code was TEXT+UNIQUE in Postgres; MySQL needs a
-- bounded length to index/UNIQUE a text-like column, so it's VARCHAR(255).
CREATE TABLE registration_qr_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(255) NOT NULL,
    student_number VARCHAR(50),
    full_name VARCHAR(255),
    course VARCHAR(255),
    year_level VARCHAR(50),
    raw_payload JSON,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_by_user_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME NULL,
    CONSTRAINT registration_qr_codes_code_key UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE scan_history (
    scan_id INT AUTO_INCREMENT PRIMARY KEY,
    scanned_by INT NULL,
    item_name VARCHAR(150),
    category VARCHAR(20),
    quantity INT,
    result VARCHAR(20) NOT NULL,
    raw_data TEXT,
    scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    inventory_id INT NULL,
    medicine_id INT NULL,
    medicine_batch_id INT NULL,
    supply_id INT NULL,
    equipment_id INT NULL,
    CONSTRAINT scan_history_result_check CHECK (result IN ('Saved', 'Invalid', 'Duplicate', 'BatchView'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sms_log (
    sms_log_id INT AUTO_INCREMENT PRIMARY KEY,
    emergency_alert_id INT NULL,
    student_name VARCHAR(150) NOT NULL,
    student_number VARCHAR(20) NOT NULL,
    parent_name VARCHAR(150),
    parent_phone VARCHAR(20) NOT NULL,
    relation VARCHAR(30),
    situation VARCHAR(150),
    message TEXT NOT NULL,
    sent_by INT NULL,
    sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- delivery_status: 'sent' = provider accepted the message for delivery
    -- (not a guarantee of handset receipt). 'failed' = the send-sms call
    -- itself failed (bad number, provider error, not configured, etc.)
    delivery_status VARCHAR(10) NOT NULL DEFAULT 'sent',
    -- provider_message_id: SMS provider's own message id, for
    -- troubleshooting a specific message. NULL for failed sends.
    provider_message_id TEXT,
    CONSTRAINT sms_log_delivery_status_check CHECK (delivery_status IN ('sent', 'failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE staff_permissions (
    user_id INT PRIMARY KEY,
    print_inventory BOOLEAN NOT NULL DEFAULT FALSE,
    print_appointments BOOLEAN NOT NULL DEFAULT FALSE,
    print_health BOOLEAN NOT NULL DEFAULT FALSE,
    print_documents BOOLEAN NOT NULL DEFAULT FALSE,
    -- delete_logs: lets a staff account delete rows from emergency_alerts
    -- and sms_log. Admins can always delete regardless of this flag.
    delete_logs BOOLEAN NOT NULL DEFAULT FALSE,
    -- reset_reports: lets a staff account use the Reset button on the
    -- Reports page. Admins can always use it regardless of this flag.
    reset_reports BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE staff_profiles (
    user_id INT PRIMARY KEY,
    department VARCHAR(100),
    `position` VARCHAR(100),
    -- staff_id_number: system-generated, read-only identifier for
    -- staff/admin accounts (generated by generateStaffId() in the app),
    -- deliberately distinct from patients' student_number.
    staff_id_number VARCHAR(30),
    date_of_birth DATE,
    birth_place VARCHAR(100),
    gender VARCHAR(20),
    civil_status VARCHAR(20),
    religion VARCHAR(50),
    nationality VARCHAR(50),
    blood_type VARCHAR(5),
    addr_region VARCHAR(100),
    addr_province VARCHAR(100),
    addr_city VARCHAR(100),
    addr_barangay VARCHAR(100),
    addr_zip VARCHAR(10),
    CONSTRAINT staff_profiles_staff_id_number_key UNIQUE (staff_id_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE supplies (
    supply_id INT AUTO_INCREMENT PRIMARY KEY,
    supply_name VARCHAR(150) NOT NULL,
    description TEXT,
    image_url TEXT,
    unit VARCHAR(30) NOT NULL DEFAULT 'Units',
    min_stock INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    legacy_inventory_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE supply_batches (
    supply_batch_id INT AUTO_INCREMENT PRIMARY KEY,
    supply_id INT NOT NULL,
    batch_number VARCHAR(50) NOT NULL,
    supplier_id INT NULL,
    received_date DATE,
    expiration_date DATE,
    quantity INT NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2),
    purchase_reference VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    legacy_batch_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL,
    CONSTRAINT supply_batches_status_check CHECK (
        status IN ('Active', 'Depleted', 'Expired', 'Recalled', 'On Hold')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- FOREIGN KEYS
-- =====================================================================

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE chat_conversations
    ADD CONSTRAINT chat_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE;

ALTER TABLE consultation_medications
    ADD CONSTRAINT consultation_medications_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES consultations(consultation_id) ON DELETE CASCADE,
    ADD CONSTRAINT consultation_medications_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE SET NULL,
    ADD CONSTRAINT consultation_medications_medicine_batch_id_fkey FOREIGN KEY (medicine_batch_id) REFERENCES medicine_batches(medicine_batch_id),
    ADD CONSTRAINT consultation_medications_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id);

ALTER TABLE consultations
    ADD CONSTRAINT consultations_attended_by_fkey FOREIGN KEY (attended_by) REFERENCES users(user_id) ON DELETE SET NULL,
    ADD CONSTRAINT consultations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE document_requests
    ADD CONSTRAINT document_requests_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE SET NULL,
    ADD CONSTRAINT document_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE emergency_alerts
    ADD CONSTRAINT emergency_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES users(user_id) ON DELETE SET NULL,
    ADD CONSTRAINT emergency_alerts_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users(user_id) ON DELETE SET NULL,
    ADD CONSTRAINT emergency_alerts_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE equipment_batches
    ADD CONSTRAINT equipment_batches_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) ON DELETE CASCADE,
    ADD CONSTRAINT equipment_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id);

ALTER TABLE inventory_batches
    ADD CONSTRAINT inventory_batches_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE CASCADE;

ALTER TABLE inventory_logs
    ADD CONSTRAINT inventory_logs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES inventory_batches(batch_id),
    ADD CONSTRAINT inventory_logs_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES consultations(consultation_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_logs_equipment_batch_id_fkey FOREIGN KEY (equipment_batch_id) REFERENCES equipment_batches(equipment_batch_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_logs_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_logs_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_logs_medicine_batch_id_fkey FOREIGN KEY (medicine_batch_id) REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_logs_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_logs_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES users(user_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_logs_supply_batch_id_fkey FOREIGN KEY (supply_batch_id) REFERENCES supply_batches(supply_batch_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_logs_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES supplies(supply_id) ON DELETE SET NULL;

ALTER TABLE inventory_notifications
    ADD CONSTRAINT inventory_notifications_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
    ADD CONSTRAINT inventory_notifications_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON DELETE SET NULL;

ALTER TABLE medicine_batches
    ADD CONSTRAINT medicine_batches_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON DELETE CASCADE,
    ADD CONSTRAINT medicine_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE RESTRICT;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE patient_profiles
    ADD CONSTRAINT patient_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE receiving_records
    ADD CONSTRAINT receiving_records_medicine_batch_id_fkey FOREIGN KEY (medicine_batch_id) REFERENCES medicine_batches(medicine_batch_id) ON DELETE CASCADE,
    ADD CONSTRAINT receiving_records_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON DELETE CASCADE,
    ADD CONSTRAINT receiving_records_received_by_fkey FOREIGN KEY (received_by) REFERENCES users(user_id) ON DELETE SET NULL,
    ADD CONSTRAINT receiving_records_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE RESTRICT;

ALTER TABLE registration_qr_codes
    ADD CONSTRAINT registration_qr_codes_used_by_user_id_fkey FOREIGN KEY (used_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE scan_history
    ADD CONSTRAINT scan_history_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(equipment_id) ON DELETE SET NULL,
    ADD CONSTRAINT scan_history_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE SET NULL,
    ADD CONSTRAINT scan_history_medicine_batch_id_fkey FOREIGN KEY (medicine_batch_id) REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL,
    ADD CONSTRAINT scan_history_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id) ON DELETE SET NULL,
    ADD CONSTRAINT scan_history_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    ADD CONSTRAINT scan_history_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES supplies(supply_id) ON DELETE SET NULL;

ALTER TABLE sms_log
    ADD CONSTRAINT sms_log_emergency_alert_id_fkey FOREIGN KEY (emergency_alert_id) REFERENCES emergency_alerts(emergency_alert_id),
    ADD CONSTRAINT sms_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES users(user_id) ON DELETE SET NULL;

ALTER TABLE staff_permissions
    ADD CONSTRAINT staff_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE staff_profiles
    ADD CONSTRAINT staff_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

ALTER TABLE supply_batches
    ADD CONSTRAINT supply_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
    ADD CONSTRAINT supply_batches_supply_id_fkey FOREIGN KEY (supply_id) REFERENCES supplies(supply_id) ON DELETE CASCADE;

-- =====================================================================
-- INDEXES
-- =====================================================================

CREATE INDEX idx_audit_action ON audit_logs (action);
CREATE INDEX idx_audit_user ON audit_logs (user_id);
CREATE INDEX idx_batches_expiration ON inventory_batches (expiration_date);
CREATE INDEX idx_batches_inventory ON inventory_batches (inventory_id);
CREATE INDEX idx_chat_conversations_user ON chat_conversations (user_id, updated_at DESC);
CREATE INDEX idx_chat_messages_conversation ON chat_messages (conversation_id, created_at);
CREATE INDEX idx_consmed_inventory ON consultation_medications (inventory_id);
CREATE INDEX idx_consmed_medbatch ON consultation_medications (medicine_batch_id);
CREATE INDEX idx_consmed_medicine ON consultation_medications (medicine_id);
CREATE INDEX idx_consult_date ON consultations (visit_date);
CREATE INDEX idx_consult_patient ON consultations (patient_id);
CREATE INDEX idx_diagnoses_active ON diagnoses (active);
CREATE INDEX idx_diagnoses_category ON diagnoses (category);
CREATE INDEX idx_docreq_patient ON document_requests (patient_id);
CREATE INDEX idx_docreq_status ON document_requests (status);
CREATE INDEX idx_emerg_status ON emergency_alerts (status);
CREATE INDEX idx_eqbatch_batch_number ON equipment_batches (batch_number);
CREATE INDEX idx_eqbatch_equipment ON equipment_batches (equipment_id);
CREATE INDEX idx_eqbatch_expiration ON equipment_batches (expiration_date);
CREATE INDEX idx_eqbatch_legacy ON equipment_batches (legacy_batch_id);
CREATE INDEX idx_eqbatch_supplier ON equipment_batches (supplier_id);
CREATE INDEX idx_equipment_active ON equipment (active);
CREATE INDEX idx_equipment_legacy ON equipment (legacy_inventory_id);
CREATE INDEX idx_equipment_name ON equipment (equipment_name);
CREATE INDEX idx_inventory_category ON inventory (category);
CREATE INDEX idx_invlog_consultation ON inventory_logs (consultation_id);
CREATE INDEX idx_invlog_created_at ON inventory_logs (created_at);
CREATE INDEX idx_invlog_equipment ON inventory_logs (equipment_id);
CREATE INDEX idx_invlog_inventory ON inventory_logs (inventory_id);
CREATE INDEX idx_invlog_medbatch ON inventory_logs (medicine_batch_id);
CREATE INDEX idx_invlog_medicine ON inventory_logs (medicine_id);
CREATE INDEX idx_invlog_staff ON inventory_logs (staff_id);
CREATE INDEX idx_invlog_supply ON inventory_logs (supply_id);
CREATE INDEX idx_invnotif_batch ON inventory_notifications (batch_id);
CREATE INDEX idx_invnotif_created_at ON inventory_notifications (created_at);
CREATE INDEX idx_invnotif_dedup ON inventory_notifications (medicine_id, notification_type, is_read);
CREATE INDEX idx_invnotif_medicine ON inventory_notifications (medicine_id);
CREATE INDEX idx_invnotif_type ON inventory_notifications (notification_type);
CREATE INDEX idx_invnotif_unread ON inventory_notifications (is_read);
CREATE INDEX idx_medbatch_batch_number ON medicine_batches (batch_number);
CREATE INDEX idx_medbatch_expiration ON medicine_batches (expiration_date);
CREATE INDEX idx_medbatch_legacy ON medicine_batches (legacy_batch_id);
CREATE INDEX idx_medbatch_medicine ON medicine_batches (medicine_id);
CREATE INDEX idx_medbatch_supplier ON medicine_batches (supplier_id);
CREATE INDEX idx_medicines_active ON medicines (active);
CREATE INDEX idx_medicines_legacy ON medicines (legacy_inventory_id);
CREATE INDEX idx_medicines_name ON medicines (medicine_name);
CREATE INDEX idx_notif_role_unread ON notifications (target_role, is_read);
CREATE INDEX idx_notif_user ON notifications (user_id);
CREATE INDEX idx_patient_profiles_student_number ON patient_profiles (student_number);
CREATE INDEX idx_receiving_batch ON receiving_records (medicine_batch_id);
CREATE INDEX idx_receiving_date ON receiving_records (received_date);
CREATE INDEX idx_receiving_medicine ON receiving_records (medicine_id);
CREATE INDEX idx_receiving_received_by ON receiving_records (received_by);
CREATE INDEX idx_receiving_supplier ON receiving_records (supplier_id);
-- Functional index (MySQL 8.0.13+) replacing Postgres's index on upper(code)
CREATE INDEX idx_registration_qr_codes_code ON registration_qr_codes ((UPPER(code)));
CREATE INDEX idx_scanhist_inventory ON scan_history (inventory_id);
CREATE INDEX idx_scanhist_medicine ON scan_history (medicine_id);
CREATE INDEX idx_scanhist_medicine_batch ON scan_history (medicine_batch_id);
CREATE INDEX idx_scanhist_scanned_by ON scan_history (scanned_by);
CREATE INDEX idx_smslog_alert ON sms_log (emergency_alert_id);
CREATE INDEX idx_supbatch_batch_number ON supply_batches (batch_number);
CREATE INDEX idx_supbatch_expiration ON supply_batches (expiration_date);
CREATE INDEX idx_supbatch_legacy ON supply_batches (legacy_batch_id);
CREATE INDEX idx_supbatch_supplier ON supply_batches (supplier_id);
CREATE INDEX idx_supbatch_supply ON supply_batches (supply_id);
CREATE INDEX idx_suppliers_name ON suppliers (supplier_name);
CREATE INDEX idx_supplies_active ON supplies (active);
CREATE INDEX idx_supplies_legacy ON supplies (legacy_inventory_id);
CREATE INDEX idx_supplies_name ON supplies (supply_name);
CREATE INDEX idx_users_role ON users (role);
-- =====================================================================
-- TRIGGERS
-- =====================================================================

DELIMITER $$

-- Was: prevent_duplicate_active_emergency() trigger on emergency_alerts
CREATE TRIGGER trg_prevent_duplicate_active_emergency
BEFORE INSERT ON emergency_alerts
FOR EACH ROW
BEGIN
    IF NEW.subject_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM emergency_alerts
        WHERE subject_id = NEW.subject_id
          AND status <> 'Resolved'
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'A new alert cannot be created while there is an unresolved alert. Please contact the clinic staff to resolve the existing alert before creating a new one.';
    END IF;
END$$

-- Was: snapshot_audit_log_actor() trigger on audit_logs.
-- NOTE: the original also auto-filled NEW.user_id from
-- current_app_user_id() (Supabase auth.uid() lookup) when it was NULL.
-- MySQL has no equivalent session context, so the app must now supply
-- user_id explicitly on insert; this trigger only fills in the
-- name/role snapshot from whatever user_id is provided.
CREATE TRIGGER trg_snapshot_audit_log_actor
BEFORE INSERT ON audit_logs
FOR EACH ROW
BEGIN
    IF NEW.actor_role IS NULL AND NEW.user_id IS NOT NULL THEN
        SELECT name, role INTO NEW.actor_name, NEW.actor_role
        FROM users WHERE user_id = NEW.user_id;
    END IF;
END$$

-- Was: snapshot_inventory_log_staff() trigger on inventory_logs
CREATE TRIGGER trg_snapshot_inventory_log_staff
BEFORE INSERT ON inventory_logs
FOR EACH ROW
BEGIN
    IF NEW.staff_id IS NOT NULL THEN
        SELECT name, role INTO NEW.staff_name_snapshot, NEW.staff_role_snapshot
        FROM users WHERE user_id = NEW.staff_id;
    END IF;
END$$

DELIMITER ;

-- =====================================================================
-- VIEWS
-- =====================================================================

CREATE VIEW medicine_inventory_view AS
SELECT
    m.medicine_id,
    m.medicine_name AS name,
    'Medicine' AS category,
    COALESCE((
        SELECT SUM(mb.quantity) FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id AND mb.status = 'Active'
    ), 0) AS quantity,
    m.unit,
    m.min_stock,
    (
        SELECT MIN(mb.expiration_date) FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id AND mb.status = 'Active' AND mb.expiration_date IS NOT NULL
    ) AS expiration_date,
    (
        SELECT mb.received_date FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id
        ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS received_date,
    (
        SELECT mb.batch_number FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id
        ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS batch_no,
    (
        SELECT mb.purchase_reference FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id
        ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS purchase_reference,
    (
        SELECT s.supplier_name FROM medicine_batches mb
        LEFT JOIN suppliers s ON s.supplier_id = mb.supplier_id
        WHERE mb.medicine_id = m.medicine_id
        ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS supplier,
    (
        SELECT COUNT(*) FROM medicine_batches mb WHERE mb.medicine_id = m.medicine_id
    ) AS batch_count,
    (
        SELECT mb.status FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id
        ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS latest_batch_status,
    TRUE AS is_fifo,
    FALSE AS needs_maintenance,
    m.generic_name,
    m.brand_name,
    m.dosage,
    m.strength,
    m.form,
    m.storage_requirement,
    m.description,
    m.image_url,
    m.active,
    m.created_at,
    m.updated_at
FROM medicines m
WHERE m.active = TRUE;

CREATE VIEW supply_inventory_view AS
SELECT
    sp.supply_id,
    sp.supply_name AS name,
    'Supply' AS category,
    COALESCE((
        SELECT SUM(b.quantity) FROM supply_batches b
        WHERE b.supply_id = sp.supply_id AND b.status = 'Active'
    ), 0) AS quantity,
    sp.unit,
    sp.min_stock,
    (
        SELECT MIN(b.expiration_date) FROM supply_batches b
        WHERE b.supply_id = sp.supply_id AND b.status = 'Active' AND b.expiration_date IS NOT NULL
    ) AS expiration_date,
    (
        SELECT b.received_date FROM supply_batches b
        WHERE b.supply_id = sp.supply_id
        ORDER BY b.created_at DESC, b.supply_batch_id DESC LIMIT 1
    ) AS received_date,
    (
        SELECT b.batch_number FROM supply_batches b
        WHERE b.supply_id = sp.supply_id
        ORDER BY b.created_at DESC, b.supply_batch_id DESC LIMIT 1
    ) AS batch_no,
    (
        SELECT b.purchase_reference FROM supply_batches b
        WHERE b.supply_id = sp.supply_id
        ORDER BY b.created_at DESC, b.supply_batch_id DESC LIMIT 1
    ) AS purchase_reference,
    (
        SELECT s.supplier_name FROM supply_batches b
        LEFT JOIN suppliers s ON s.supplier_id = b.supplier_id
        WHERE b.supply_id = sp.supply_id
        ORDER BY b.created_at DESC, b.supply_batch_id DESC LIMIT 1
    ) AS supplier,
    (
        SELECT COUNT(*) FROM supply_batches b WHERE b.supply_id = sp.supply_id
    ) AS batch_count,
    FALSE AS is_fifo,
    FALSE AS needs_maintenance,
    sp.description,
    sp.image_url,
    sp.active,
    sp.created_at,
    sp.updated_at
FROM supplies sp
WHERE sp.active = TRUE;

CREATE VIEW equipment_inventory_view AS
SELECT
    eq.equipment_id,
    eq.equipment_name AS name,
    'Equipment' AS category,
    COALESCE((
        SELECT SUM(b.quantity) FROM equipment_batches b
        WHERE b.equipment_id = eq.equipment_id AND b.status = 'Active'
    ), 0) AS quantity,
    eq.unit,
    eq.min_stock,
    (
        SELECT MIN(b.expiration_date) FROM equipment_batches b
        WHERE b.equipment_id = eq.equipment_id AND b.status = 'Active' AND b.expiration_date IS NOT NULL
    ) AS expiration_date,
    (
        SELECT b.received_date FROM equipment_batches b
        WHERE b.equipment_id = eq.equipment_id
        ORDER BY b.created_at DESC, b.equipment_batch_id DESC LIMIT 1
    ) AS received_date,
    (
        SELECT b.batch_number FROM equipment_batches b
        WHERE b.equipment_id = eq.equipment_id
        ORDER BY b.created_at DESC, b.equipment_batch_id DESC LIMIT 1
    ) AS batch_no,
    (
        SELECT b.purchase_reference FROM equipment_batches b
        WHERE b.equipment_id = eq.equipment_id
        ORDER BY b.created_at DESC, b.equipment_batch_id DESC LIMIT 1
    ) AS purchase_reference,
    (
        SELECT s.supplier_name FROM equipment_batches b
        LEFT JOIN suppliers s ON s.supplier_id = b.supplier_id
        WHERE b.equipment_id = eq.equipment_id
        ORDER BY b.created_at DESC, b.equipment_batch_id DESC LIMIT 1
    ) AS supplier,
    (
        SELECT COUNT(*) FROM equipment_batches b WHERE b.equipment_id = eq.equipment_id
    ) AS batch_count,
    FALSE AS is_fifo,
    COALESCE((
        SELECT MAX(b.needs_maintenance OR (b.expiration_date IS NOT NULL AND b.expiration_date < CURDATE()))
        FROM equipment_batches b
        WHERE b.equipment_id = eq.equipment_id AND b.status = 'Active'
    ), FALSE) AS needs_maintenance,
    eq.description,
    eq.image_url,
    eq.active,
    eq.created_at,
    eq.updated_at
FROM equipment eq
WHERE eq.active = TRUE;

-- =====================================================================
-- FUNCTIONS / PROCEDURES
--
-- Postgres FUNCTIONs that returned a single scalar convert cleanly to
-- MySQL FUNCTIONs. Ones that returned a table/row set become
-- PROCEDUREs (MySQL functions cannot return result sets). Ones that
-- depended on Supabase's auth.uid()/auth.email() or pgcrypto now take
-- the relevant value as an explicit parameter instead — see header
-- notes at the top of schema_mysql.sql.
-- =====================================================================

DELIMITER $$

CREATE FUNCTION check_student_number_registered(p_student_number VARCHAR(20))
RETURNS BOOLEAN DETERMINISTIC READS SQL DATA
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM patient_profiles WHERE UPPER(student_number) = UPPER(p_student_number)
    );
END$$

-- Was: claim_registration_qr(...) — upsert marking a QR code used.
-- ON CONFLICT ... DO UPDATE becomes INSERT ... ON DUPLICATE KEY UPDATE.
CREATE PROCEDURE claim_registration_qr(
    IN p_code VARCHAR(255),
    IN p_user_id INT,
    IN p_student_number VARCHAR(50),
    IN p_full_name VARCHAR(255),
    IN p_course VARCHAR(255),
    IN p_year_level VARCHAR(50)
)
BEGIN
    DECLARE v_rows INT;

    UPDATE registration_qr_codes
    SET is_used = TRUE, used_by_user_id = p_user_id, used_at = CURRENT_TIMESTAMP
    WHERE UPPER(code) = UPPER(p_code) AND is_used = FALSE;

    SET v_rows = ROW_COUNT();

    IF v_rows = 0 THEN
        INSERT INTO registration_qr_codes
            (code, student_number, full_name, course, year_level, is_used, used_by_user_id, used_at)
        VALUES
            (p_code, p_student_number, p_full_name, p_course, p_year_level, TRUE, p_user_id, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
            is_used = IF(is_used = FALSE, TRUE, is_used),
            used_by_user_id = IF(is_used = FALSE, p_user_id, used_by_user_id),
            used_at = IF(is_used = FALSE, CURRENT_TIMESTAMP, used_at);
    END IF;
END$$

-- Was: clear_own_pin() — used auth.uid() to find the caller's row.
-- The app must now pass the acting user's id explicitly.
CREATE PROCEDURE clear_own_pin(IN p_user_id INT)
BEGIN
    UPDATE users
    SET pin_hash = NULL, pin_attempts = 0, pin_locked_until = NULL
    WHERE user_id = p_user_id;
END$$

-- Was: current_app_role() — used auth.uid(); now takes user_id directly.
CREATE FUNCTION current_app_role(p_user_id INT)
RETURNS VARCHAR(10) DETERMINISTIC READS SQL DATA
BEGIN
    RETURN (SELECT role FROM users WHERE user_id = p_user_id);
END$$

-- Was: current_app_user_id() — used auth.uid(); now takes user_id directly
-- (kept only for parity with the original API; trivial once auth is
-- handled by the app).
CREATE FUNCTION current_app_user_id(p_user_id INT)
RETURNS INT DETERMINISTIC NO SQL
BEGIN
    RETURN p_user_id;
END$$

CREATE FUNCTION disable_account_after_lockout(p_email VARCHAR(150))
RETURNS INT DETERMINISTIC MODIFIES SQL DATA
BEGIN
    UPDATE users SET is_active = FALSE WHERE LOWER(email) = LOWER(p_email);
    RETURN ROW_COUNT();
END$$

CREATE FUNCTION email_has_pin(p_email VARCHAR(150))
RETURNS BOOLEAN DETERMINISTIC READS SQL DATA
BEGIN
    RETURN (SELECT pin_hash IS NOT NULL FROM users WHERE LOWER(email) = LOWER(p_email) LIMIT 1);
END$$

CREATE FUNCTION email_is_registered(p_email VARCHAR(150))
RETURNS BOOLEAN DETERMINISTIC READS SQL DATA
BEGIN
    RETURN EXISTS (SELECT 1 FROM users WHERE LOWER(email) = LOWER(p_email));
END$$

-- Was: get_monthly_inventory_movement(months_back) RETURNS TABLE(...)
-- FILTER (WHERE ...) has no MySQL equivalent -> rewritten as SUM(CASE...).
CREATE PROCEDURE get_monthly_inventory_movement(IN months_back INT)
BEGIN
    SELECT
        DATE_FORMAT(created_at, '%Y-%m-01') AS month,
        COALESCE(SUM(CASE WHEN action_type IN ('Received', 'Replenish') AND quantity_change > 0
                          THEN quantity_change ELSE 0 END), 0) AS received_qty,
        COALESCE(SUM(CASE WHEN action_type IN ('Released', 'Release')
                          THEN ABS(quantity_change) ELSE 0 END), 0) AS released_qty
    FROM inventory_logs
    WHERE created_at >= DATE_SUB(DATE_FORMAT(CURRENT_TIMESTAMP, '%Y-%m-01'), INTERVAL (months_back - 1) MONTH)
    GROUP BY DATE_FORMAT(created_at, '%Y-%m-01')
    ORDER BY month;
END$$

-- Was: get_top_used_medicines(days_back, result_limit) RETURNS TABLE(...)
CREATE PROCEDURE get_top_used_medicines(IN days_back INT, IN result_limit INT)
BEGIN
    SELECT
        m.medicine_id,
        m.medicine_name,
        SUM(ABS(l.quantity_change)) AS total_released
    FROM inventory_logs l
    JOIN medicines m ON m.medicine_id = l.medicine_id
    WHERE l.action_type IN ('Released', 'Release')
      AND l.medicine_id IS NOT NULL
      AND l.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL days_back DAY)
    GROUP BY m.medicine_id, m.medicine_name
    ORDER BY total_released DESC
    LIMIT result_limit;
END$$

CREATE FUNCTION has_active_emergency_alert(p_reporter_id INT)
RETURNS BOOLEAN DETERMINISTIC READS SQL DATA
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM emergency_alerts
        WHERE reported_by = p_reporter_id AND status IN ('Active', 'Acknowledged')
    );
END$$

-- Was: has_own_pin() — used auth.uid(); now takes user_id directly.
CREATE FUNCTION has_own_pin(p_user_id INT)
RETURNS BOOLEAN DETERMINISTIC READS SQL DATA
BEGIN
    RETURN (SELECT pin_hash IS NOT NULL FROM users WHERE user_id = p_user_id);
END$$

-- Was: link_current_auth_user() — Supabase-auth specific (auth.uid()/
-- auth.email()). Rewritten to take the auth id/email explicitly; the
-- app is responsible for obtaining these from its own auth provider.
CREATE FUNCTION link_current_auth_user(p_auth_user_id CHAR(36), p_auth_email VARCHAR(150))
RETURNS INT MODIFIES SQL DATA
BEGIN
    DECLARE v_user_id INT DEFAULT NULL;

    IF p_auth_user_id IS NULL OR p_auth_email IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE users
    SET auth_user_id = p_auth_user_id
    WHERE LOWER(email) = LOWER(p_auth_email)
      AND (auth_user_id IS NULL OR auth_user_id <> p_auth_user_id);

    SELECT user_id INTO v_user_id FROM users WHERE LOWER(email) = LOWER(p_auth_email) LIMIT 1;

    RETURN v_user_id;
END$$

CREATE FUNCTION lookup_email_by_school_id(p_code VARCHAR(50))
RETURNS VARCHAR(150) DETERMINISTIC READS SQL DATA
BEGIN
    DECLARE v_email VARCHAR(150);
    SELECT u.email INTO v_email
    FROM users u
    LEFT JOIN patient_profiles pp ON pp.user_id = u.user_id
    LEFT JOIN staff_profiles sp ON sp.user_id = u.user_id
    WHERE u.is_active = TRUE
      AND (
          UPPER(u.school_id_barcode) = UPPER(p_code)
          OR UPPER(u.username) = UPPER(p_code)
          OR UPPER(pp.student_number) = UPPER(p_code)
          OR UPPER(sp.staff_id_number) = UPPER(p_code)
      )
    LIMIT 1;
    RETURN v_email;
END$$

CREATE FUNCTION lookup_is_active_by_email(p_email VARCHAR(150))
RETURNS BOOLEAN DETERMINISTIC READS SQL DATA
BEGIN
    RETURN (SELECT is_active FROM users WHERE LOWER(email) = LOWER(p_email) LIMIT 1);
END$$

-- Was: lookup_registration_qr(p_code) RETURNS TABLE(...)
CREATE PROCEDURE lookup_registration_qr(IN p_code VARCHAR(255))
BEGIN
    SELECT r.student_number, r.full_name, r.course, r.year_level, r.is_used
    FROM registration_qr_codes r
    WHERE UPPER(r.code) = UPPER(p_code)
    LIMIT 1;
END$$

CREATE FUNCTION lookup_role_by_email(p_email VARCHAR(150))
RETURNS VARCHAR(10) DETERMINISTIC READS SQL DATA
BEGIN
    RETURN (SELECT role FROM users WHERE LOWER(email) = LOWER(p_email) LIMIT 1);
END$$

CREATE FUNCTION notification_exists(p_message TEXT, p_user_id INT, p_target_role VARCHAR(10))
RETURNS BOOLEAN DETERMINISTIC READS SQL DATA
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM notifications
        WHERE message = p_message
          AND ((p_user_id IS NOT NULL AND user_id = p_user_id)
               OR (p_target_role IS NOT NULL AND target_role = p_target_role))
        LIMIT 1
    );
END$$

CREATE PROCEDURE record_failed_login(IN p_email VARCHAR(150))
BEGIN
    DECLARE v_attempts INT;

    UPDATE users
    SET failed_login_attempts = failed_login_attempts + 1
    WHERE UPPER(email) = UPPER(p_email) AND is_active = TRUE;

    SELECT failed_login_attempts INTO v_attempts
    FROM users WHERE UPPER(email) = UPPER(p_email) LIMIT 1;

    IF v_attempts >= 15 THEN
        UPDATE users SET is_active = FALSE WHERE UPPER(email) = UPPER(p_email);
    END IF;
END$$

CREATE PROCEDURE reset_failed_login(IN p_email VARCHAR(150))
BEGIN
    UPDATE users SET failed_login_attempts = 0 WHERE UPPER(email) = UPPER(p_email);
END$$

-- Was: run_expiration_check() — rewritten with a cursor since MySQL
-- procedures support cursor-based loops much like plpgsql's FOR loop.
CREATE PROCEDURE run_expiration_check()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_medicine_batch_id INT;
    DECLARE v_medicine_id INT;
    DECLARE v_expiration_date DATE;
    DECLARE v_batch_number VARCHAR(50);
    DECLARE v_medicine_name VARCHAR(150);
    DECLARE v_days_left INT;
    DECLARE v_active_type VARCHAR(30);
    DECLARE v_title VARCHAR(150);
    DECLARE v_message TEXT;
    DECLARE v_priority VARCHAR(10);

    DECLARE batch_cursor CURSOR FOR
        SELECT mb.medicine_batch_id, mb.medicine_id, mb.expiration_date, mb.batch_number, m.medicine_name
        FROM medicine_batches mb
        JOIN medicines m ON m.medicine_id = mb.medicine_id
        WHERE mb.expiration_date IS NOT NULL AND mb.status IN ('Active', 'Expired');

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    UPDATE medicine_batches
    SET status = 'Expired'
    WHERE status = 'Active' AND expiration_date IS NOT NULL AND expiration_date < CURDATE();

    OPEN batch_cursor;

    read_loop: LOOP
        FETCH batch_cursor INTO v_medicine_batch_id, v_medicine_id, v_expiration_date, v_batch_number, v_medicine_name;
        IF done THEN
            LEAVE read_loop;
        END IF;

        SET v_days_left = DATEDIFF(v_expiration_date, CURDATE());
        SET v_active_type = CASE
            WHEN v_days_left < 0 THEN 'expired'
            WHEN v_days_left <= 7 THEN 'expiring_7'
            WHEN v_days_left <= 30 THEN 'expiring_30'
            WHEN v_days_left <= 60 THEN 'expiring_60'
            WHEN v_days_left <= 90 THEN 'expiring_90'
            ELSE NULL
        END;

        -- Auto-clear stale tiers for this batch
        DELETE FROM inventory_notifications
        WHERE batch_id = v_medicine_batch_id
          AND notification_type IN ('expiring_90', 'expiring_60', 'expiring_30', 'expiring_7', 'expired')
          AND (v_active_type IS NULL OR notification_type <> v_active_type);

        IF v_active_type IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM inventory_notifications
            WHERE batch_id = v_medicine_batch_id AND notification_type = v_active_type
        ) THEN
            SET v_title = CASE v_active_type
                WHEN 'expired' THEN CONCAT('Expired: ', v_medicine_name)
                WHEN 'expiring_7' THEN CONCAT('Expiring in 7 Days: ', v_medicine_name)
                WHEN 'expiring_30' THEN CONCAT('Expiring in 30 Days: ', v_medicine_name)
                WHEN 'expiring_60' THEN CONCAT('Expiring in 60 Days: ', v_medicine_name)
                WHEN 'expiring_90' THEN CONCAT('Expiring in 90 Days: ', v_medicine_name)
            END;

            SET v_message = CASE v_active_type
                WHEN 'expired' THEN CONCAT('Batch ', v_batch_number, ' of ', v_medicine_name, ' expired on ', v_expiration_date, ' and can no longer be released.')
                WHEN 'expiring_7' THEN CONCAT('Batch ', v_batch_number, ' of ', v_medicine_name, ' expires on ', v_expiration_date, ' (within 7 days) \u2014 urgent.')
                WHEN 'expiring_30' THEN CONCAT('Batch ', v_batch_number, ' of ', v_medicine_name, ' expires on ', v_expiration_date, ' (within 30 days) \u2014 plan to use or reorder.')
                ELSE CONCAT('Batch ', v_batch_number, ' of ', v_medicine_name, ' expires on ', v_expiration_date, '.')
            END;

            SET v_priority = CASE v_active_type
                WHEN 'expired' THEN 'critical'
                WHEN 'expiring_7' THEN 'critical'
                WHEN 'expiring_30' THEN 'high'
                WHEN 'expiring_60' THEN 'medium'
                ELSE 'low'
            END;

            INSERT INTO inventory_notifications (notification_type, medicine_id, batch_id, title, message, priority)
            VALUES (v_active_type, v_medicine_id, v_medicine_batch_id, v_title, v_message, v_priority);
        END IF;
    END LOOP;

    CLOSE batch_cursor;
END$$

-- Was: search_patients_public(query) RETURNS TABLE(...). ILIKE has no
-- MySQL equivalent; MySQL's default collation (utf8mb4_general_ci /
-- _0900_ai_ci) is already case-insensitive, so plain LIKE works the same.
CREATE PROCEDURE search_patients_public(IN p_query VARCHAR(255))
BEGIN
    SELECT u.user_id, u.name, pp.student_number
    FROM users u
    JOIN patient_profiles pp ON pp.user_id = u.user_id
    WHERE u.role = 'patient' AND u.is_active = TRUE
      AND (u.name LIKE CONCAT('%', p_query, '%') OR pp.student_number LIKE CONCAT('%', p_query, '%'))
    ORDER BY u.name
    LIMIT 200;
END$$

-- Was: set_own_pin(p_pin) — used auth.uid() + pgcrypto crypt()/gen_salt().
-- Hash the 4-digit PIN with bcrypt in your APPLICATION CODE (e.g. Node
-- bcrypt, PHP password_hash(), Python bcrypt) and pass the resulting
-- hash in here; MySQL has no built-in bcrypt.
CREATE PROCEDURE set_own_pin(IN p_user_id INT, IN p_pin_hash TEXT)
BEGIN
    UPDATE users
    SET pin_hash = p_pin_hash, pin_attempts = 0, pin_locked_until = NULL
    WHERE user_id = p_user_id;

    IF ROW_COUNT() = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No matching account for the given user id';
    END IF;
END$$

-- Was: verify_pin_hash(p_hash, p_pin) — used pgcrypto crypt(). bcrypt
-- verification cannot be done in plain SQL; compare the hash to the
-- entered PIN using your application's bcrypt library instead. This
-- stub is kept only so calling code has an obvious place to see the
-- change; it always returns FALSE.
CREATE FUNCTION verify_pin_hash(p_hash TEXT, p_pin TEXT)
RETURNS BOOLEAN DETERMINISTIC NO SQL
BEGIN
    RETURN FALSE; -- verify PIN via bcrypt in application code instead
END$$

DELIMITER ;
