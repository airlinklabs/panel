/**
 * V2 API — Admin router.
 *
 * Mounts all admin sub-routers under /api/v2/admin.
 */

import { Router } from "express";
import nodesRouter from "./nodes";
import usersRouter from "./users";
import serversRouter from "./servers";
import settingsRouter from "./settings";
import databasesRouter from "./databases";
import imagesRouter from "./images";
import miscRouter from "./misc";
import rolesRouter from "./roles";

const router = Router();

router.use("/nodes", nodesRouter);
router.use("/users", usersRouter);
router.use("/servers", serversRouter);
router.use("/settings", settingsRouter);
router.use("/databases", databasesRouter);
router.use("/images", imagesRouter);
router.use("/roles", rolesRouter);

// miscRouter handles: locations, mounts, apikeys, addons, overview, radar, analytics, playerstats
router.use("/", miscRouter);

export default router;
