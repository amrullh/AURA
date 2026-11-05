
\restrict 8AvMonewx17ifJeO8dbkuZ2X6dclv7oMlHkJH2ZwKDfsOKWKBL9yFb5iPvNA6aO

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE TYPE public.actor_type AS ENUM (
    'USER',
    'AGENT'
);

CREATE TYPE public.decision_status AS ENUM (
    'PENDING',
    'ESCALATED',
    'APPROVED',
    'REJECTED'
);

CREATE TYPE public.processing_status AS ENUM (
    'QUEUED',
    'PROCESSING',
    'DONE',
    'FAILED'
);

CREATE TYPE public.role AS ENUM (
    'STAF_FINANCE',
    'VERIFIKATOR',
    'ADMIN'
);

CREATE TYPE public.verdict AS ENUM (
    'CLEAN',
    'EXCEPTION',
    'DUPLICATE',
    'NEEDS_REVIEW'
);

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.audit_logs (
    id character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_type public.actor_type NOT NULL,
    actor_id character varying NOT NULL,
    actor_name character varying NOT NULL,
    action character varying NOT NULL,
    object_type character varying NOT NULL,
    object_id character varying NOT NULL,
    summary text NOT NULL,
    detail jsonb
);

CREATE TABLE public.batches (
    id character varying NOT NULL,
    name character varying NOT NULL,
    created_by_id character varying,
    created_by_name character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.decisions (
    id character varying NOT NULL,
    invoice_id character varying NOT NULL,
    actor_id character varying NOT NULL,
    actor_name character varying NOT NULL,
    actor_role public.role NOT NULL,
    action character varying NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.goods_receipts (
    id character varying NOT NULL,
    grn_number character varying NOT NULL,
    po_id character varying NOT NULL,
    received_date date NOT NULL
);

CREATE TABLE public.grn_lines (
    id character varying NOT NULL,
    grn_id character varying NOT NULL,
    line_no integer NOT NULL,
    item_id character varying NOT NULL,
    quantity_received integer NOT NULL
);

CREATE TABLE public.invoices (
    id character varying NOT NULL,
    batch_id character varying NOT NULL,
    file_name character varying NOT NULL,
    file_path character varying,
    file_hash character varying NOT NULL,
    content_type character varying NOT NULL,
    page_count integer DEFAULT 1 NOT NULL,
    invoice_number character varying,
    vendor_id character varying,
    vendor_name character varying,
    po_number character varying,
    invoice_date date,
    total_amount bigint,
    difference_amount bigint,
    processing_status public.processing_status DEFAULT 'QUEUED'::public.processing_status NOT NULL,
    iteration integer,
    verdict public.verdict,
    confidence double precision,
    decision_status public.decision_status DEFAULT 'PENDING'::public.decision_status NOT NULL,
    queue_owner public.role,
    review_reason character varying,
    price_tolerance_pct double precision DEFAULT '0.5'::double precision NOT NULL,
    confidence_threshold double precision DEFAULT '0.7'::double precision NOT NULL,
    analysis jsonb,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    duration_ms integer,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.items (
    id character varying NOT NULL,
    sku character varying NOT NULL,
    name character varying NOT NULL,
    unit character varying NOT NULL
);

CREATE TABLE public.po_lines (
    id character varying NOT NULL,
    po_id character varying NOT NULL,
    line_no integer NOT NULL,
    item_id character varying NOT NULL,
    quantity integer NOT NULL,
    unit_price integer NOT NULL
);

CREATE TABLE public.purchase_orders (
    id character varying NOT NULL,
    po_number character varying NOT NULL,
    po_date date NOT NULL,
    vendor_id character varying NOT NULL
);

CREATE TABLE public.settings (
    id character varying DEFAULT 'default'::character varying NOT NULL,
    price_tolerance_pct double precision DEFAULT '0.5'::double precision NOT NULL,
    confidence_threshold double precision DEFAULT '0.7'::double precision NOT NULL,
    manual_minutes_per_invoice double precision,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by character varying
);

CREATE TABLE public.users (
    id character varying NOT NULL,
    name character varying NOT NULL,
    email character varying NOT NULL,
    password_hash character varying NOT NULL,
    role public.role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vendors (
    id character varying NOT NULL,
    name character varying NOT NULL,
    npwp character varying NOT NULL,
    payment_terms_days integer DEFAULT 30 NOT NULL,
    has_contract boolean DEFAULT false NOT NULL,
    contract_text text
);

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "PK_05148947415204a897e8beb2553" PRIMARY KEY (id);

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY (id);

ALTER TABLE ONLY public.po_lines
    ADD CONSTRAINT "PK_3f9ea7f19964d20ecb77ef629cf" PRIMARY KEY (id);

ALTER TABLE ONLY public.decisions
    ADD CONSTRAINT "PK_48eee6fa229cd5e43648f6a2ec3" PRIMARY KEY (id);

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT "PK_55e7ff646e969b61d37eea5be7a" PRIMARY KEY (id);

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY (id);

ALTER TABLE ONLY public.grn_lines
    ADD CONSTRAINT "PK_9716c2ffa1be55de5558fccd5a2" PRIMARY KEY (id);

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT "PK_9c956c9797edfae5c6ddacc4e6e" PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);

ALTER TABLE ONLY public.items
    ADD CONSTRAINT "PK_ba5885359424c15ca6b9e79bcf6" PRIMARY KEY (id);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT "PK_f8cac411be0211f923e1be8534f" PRIMARY KEY (id);

ALTER TABLE ONLY public.grn_lines
    ADD CONSTRAINT "UQ_20bf2480b7827c8964770dc5fb0" UNIQUE (grn_id, line_no);

ALTER TABLE ONLY public.po_lines
    ADD CONSTRAINT "UQ_218415af9e74073b97eea761cd0" UNIQUE (po_id, line_no);

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "UQ_367c291b448873b2c541bd36585" UNIQUE (file_hash);

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "UQ_74065a5d2b8c4c14b8b8fcf0159" UNIQUE (po_number);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT "UQ_7e4b381bc68657d53b5c1c681b3" UNIQUE (grn_number);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);

ALTER TABLE ONLY public.items
    ADD CONSTRAINT "UQ_ed4485e4da7cc242cf46db2e3a9" UNIQUE (sku);

CREATE INDEX "IDX_20f680a95edb5ed1b278159e08" ON public.invoices USING btree (verdict, decision_status);

CREATE INDEX "IDX_2cd10fda8276bb995288acfbfb" ON public.audit_logs USING btree (created_at);

CREATE INDEX "IDX_6c4b59b054bd93232ec54b3e39" ON public.invoices USING btree (processing_status);

CREATE INDEX "IDX_88dd090767454b111a10f72ae9" ON public.decisions USING btree (invoice_id);

CREATE INDEX "IDX_9161d430c7bc90a2cd0bf4cba7" ON public.invoices USING btree (batch_id);

CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON public.audit_logs USING btree (action);

CREATE INDEX "IDX_d8f8d3788694e1b3f96c42c36f" ON public.invoices USING btree (invoice_number);

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "FK_346ae76b48e8f5042cf93b8df26" FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);

ALTER TABLE ONLY public.po_lines
    ADD CONSTRAINT "FK_5c3cd4ad2dc26873a37a28a8f3f" FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.grn_lines
    ADD CONSTRAINT "FK_7295ef33a8b86553cd53c024513" FOREIGN KEY (item_id) REFERENCES public.items(id);

ALTER TABLE ONLY public.decisions
    ADD CONSTRAINT "FK_88dd090767454b111a10f72ae9b" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "FK_9161d430c7bc90a2cd0bf4cba75" FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.grn_lines
    ADD CONSTRAINT "FK_9b86a2a6c242e8b8cead0f93804" FOREIGN KEY (grn_id) REFERENCES public.goods_receipts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.po_lines
    ADD CONSTRAINT "FK_b9162677a5dcfb8c5f0a4a91a57" FOREIGN KEY (item_id) REFERENCES public.items(id);

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT "FK_f03f68a6a9c40e2ff70c9399884" FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id);

\unrestrict 8AvMonewx17ifJeO8dbkuZ2X6dclv7oMlHkJH2ZwKDfsOKWKBL9yFb5iPvNA6aO

