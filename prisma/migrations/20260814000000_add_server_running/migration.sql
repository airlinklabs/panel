-- Add Running flag to Server so stopped servers free their node capacity.
ALTER TABLE "Server" ADD COLUMN "Running" BOOLEAN NOT NULL DEFAULT false;
