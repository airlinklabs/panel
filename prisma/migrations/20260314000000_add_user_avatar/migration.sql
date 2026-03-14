ALTER TABLE "Users" ADD COLUMN "avatar" TEXT;
ALTER TABLE "settings" ADD COLUMN "lightTheme" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "settings" ADD COLUMN "darkTheme" TEXT NOT NULL DEFAULT 'default';
