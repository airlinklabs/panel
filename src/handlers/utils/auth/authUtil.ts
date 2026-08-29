import { getSettings } from "../../settingsCache";
import type { Request, Response, NextFunction } from "express";
import prisma from "../../../db";
import { renderErrorPage } from "../../errorPages";

export const isAuthenticated =
  (isAdminRequired = false, requiredPermission: string | null = null) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.session.user?.id;

    if (!userId) {
      return res.redirect("/login");
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });

    if (!user) {
      return res.redirect("/login");
    }

    if (isAdminRequired) {
      if (!user.isAdmin) {
        return renderErrorPage(req, res, 403);
      }

      if (!user.totpEnabled) {
        const settings = await getSettings();
        if (settings?.require2faForAdmins) {
          return res.redirect("/account/2fa/setup?required=1");
        }
      }

      // Enforce granular permissions when the admin has a non-empty
      // permissions list. Empty array = unrestricted admin access (backwards
      // compatible with existing admin accounts that have no permissions set).
      if (requiredPermission) {
        let userPermissions: string[];
        try {
          userPermissions = JSON.parse(user.permissions || "[]");
        } catch {
          userPermissions = [];
        }

        if (userPermissions.length > 0) {
          const hasPermission = userPermissions.some((perm: string) => {
            if (perm === requiredPermission) {
              return true;
            }
            if (perm === "*") {
              return true;
            }
            if (perm.endsWith(".*")) {
              const base = perm.slice(0, -2);
              return requiredPermission.startsWith(`${base}.`);
            }
            return false;
          });

          if (!hasPermission) {
            return renderErrorPage(req, res, 403);
          }
        }
      }

      return next();
    }

    if (requiredPermission) {
      let userPermissions: string[];
      try {
        userPermissions = JSON.parse(user.permissions || "[]");
      } catch {
        return renderErrorPage(req, res, 403);
      }

      const hasPermission = userPermissions.some((perm: string) => {
        if (perm === requiredPermission) {
          return true;
        }
        if (perm === "*") {
          return true;
        }
        if (perm.endsWith(".*")) {
          const base = perm.slice(0, -2);
          return requiredPermission.startsWith(`${base}.`);
        }
        return false;
      });

      if (hasPermission) {
        return next();
      }

      return renderErrorPage(req, res, 403);
    }
    next();
  };

// JSON-friendly auth guard for API routes that must return a 401 JSON body
// (rather than an HTML redirect) when the caller is unauthenticated.
export const requireApiAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.session.user?.id;
  if (!userId) {
    return res.status(401).json({ results: [] });
  }

  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(401).json({ results: [] });
  }

  return next();
};
