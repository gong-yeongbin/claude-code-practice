-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('BUYER', 'SOURCING', 'MANUFACTURER');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('DRAFT', 'PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "change_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" "user_role" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" SERIAL NOT NULL,
    "order_no" VARCHAR(50) NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_request" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "requester_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "status" "change_request_status" NOT NULL DEFAULT 'PENDING',
    "reviewer_id" INTEGER,
    "review_comment" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_version" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "version_no" INTEGER NOT NULL,
    "product_name" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "delivery_date" DATE NOT NULL,
    "spec" JSONB,
    "change_request_id" INTEGER,
    "valid_from" TIMESTAMPTZ NOT NULL,
    "valid_to" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_order_no_key" ON "purchase_order"("order_no");

-- CreateIndex
CREATE UNIQUE INDEX "uq_po_version" ON "purchase_order_version"("purchase_order_id", "version_no");

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_version" ADD CONSTRAINT "purchase_order_version_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_version" ADD CONSTRAINT "purchase_order_version_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
