-- Add wallpaper fields to settings table
ALTER TABLE "settings" ADD COLUMN "loginWallpaper" TEXT;
ALTER TABLE "settings" ADD COLUMN "registerWallpaper" TEXT;
