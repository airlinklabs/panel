"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVAILABLE_PERMISSIONS = void 0;
var express_1 = require("express");
var client_1 = require("@prisma/client");
var logger_1 = require("../../handlers/logger");
var prisma = new client_1.PrismaClient();
// Define available permissions
exports.AVAILABLE_PERMISSIONS = {
    // Admin permissions
    ADMIN_ACCESS: 'admin.access',
    ADMIN_SETTINGS: 'admin.settings',
    ADMIN_USERS: 'admin.users',
    ADMIN_SERVERS: 'admin.servers',
    ADMIN_NODES: 'admin.nodes',
    ADMIN_LOCATIONS: 'admin.locations',
    ADMIN_IMAGES: 'admin.images',
    // User permissions
    USER_CREATE_SERVER: 'user.create-server',
    USER_DELETE_SERVER: 'user.delete-server',
    USER_MODIFY_SERVER: 'user.modify-server',
    USER_VIEW_SERVERS: 'user.view-servers',
    USER_ACCESS_SFTP: 'user.access-sftp',
    USER_ACCESS_CONSOLE: 'user.access-console',
    USER_VIEW_STARTUP: 'user.view-startup',
    USER_EDIT_STARTUP: 'user.edit-startup',
};
var permissionsModule = {
    info: {
        name: 'Permissions Module',
        description: 'Handles role and permission management',
        version: '1.0.0',
        moduleVersion: '1.0.0',
        author: 'AirLinkLab',
        license: 'MIT',
    },
    router: function () {
        var router = (0, express_1.Router)();
        var isAdmin = function () {
            return function (req, res, next) { return __awaiter(void 0, void 0, void 0, function () {
                var _a, _b;
                return __generator(this, function (_c) {
                    if (!((_b = (_a = req.session) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.isAdmin)) {
                        res.status(403).json({ error: 'Unauthorized access' });
                        return [2 /*return*/];
                    }
                    next();
                    return [2 /*return*/];
                });
            }); };
        };
        // Get all roles
        router.get('/admin/roles', isAdmin(), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
            var roles, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, prisma.role.findMany({
                                include: {
                                    permissions: true
                                }
                            })];
                    case 1:
                        roles = _a.sent();
                        res.render('admin/roles/roles', { roles: roles });
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        logger_1.default.error('Error fetching roles:', error_1);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); });
        // Create new role
        router.post('/admin/roles', isAdmin(), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
            var _a, name, description, permissions, role, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = req.body, name = _a.name, description = _a.description, permissions = _a.permissions;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, prisma.role.create({
                                data: {
                                    name: name,
                                    description: description,
                                    permissions: {
                                        create: permissions.map(function (permission) { return ({
                                            permission: permission
                                        }); })
                                    }
                                },
                                include: {
                                    permissions: true
                                }
                            })];
                    case 2:
                        role = _b.sent();
                        res.redirect('/admin/roles');
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _b.sent();
                        logger_1.default.error('Error creating role:', error_2);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // Update role
        router.patch('/admin/roles/:id', isAdmin(), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
            var id, _a, name, description, permissions, role, error_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        id = req.params.id;
                        _a = req.body, name = _a.name, description = _a.description, permissions = _a.permissions;
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        // Delete existing permissions
                        return [4 /*yield*/, prisma.rolePermission.deleteMany({
                                where: { roleId: parseInt(id) }
                            })];
                    case 2:
                        // Delete existing permissions
                        _b.sent();
                        return [4 /*yield*/, prisma.role.update({
                                where: { id: parseInt(id) },
                                data: {
                                    name: name,
                                    description: description,
                                    permissions: {
                                        create: permissions.map(function (permission) { return ({
                                            permission: permission
                                        }); })
                                    }
                                },
                                include: {
                                    permissions: true
                                }
                            })];
                    case 3:
                        role = _b.sent();
                        res.json(role);
                        return [3 /*break*/, 5];
                    case 4:
                        error_3 = _b.sent();
                        logger_1.default.error('Error updating role:', error_3);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        }); });
        // Delete role
        router.delete('/admin/roles/:id', isAdmin(), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
            var id, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        id = req.params.id;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, prisma.role.delete({
                                where: { id: parseInt(id) }
                            })];
                    case 2:
                        _a.sent();
                        res.status(204).send();
                        return [3 /*break*/, 4];
                    case 3:
                        error_4 = _a.sent();
                        logger_1.default.error('Error deleting role:', error_4);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // Assign role to user
        router.post('/admin/users/:userId/role', isAdmin(), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
            var userId, roleId, userRole, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        userId = req.params.userId;
                        roleId = req.body.roleId;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, prisma.userRole.create({
                                data: {
                                    userId: parseInt(userId),
                                    roleId: parseInt(roleId)
                                }
                            })];
                    case 2:
                        userRole = _a.sent();
                        res.status(201).json(userRole);
                        return [3 /*break*/, 4];
                    case 3:
                        error_5 = _a.sent();
                        logger_1.default.error('Error assigning role:', error_5);
                        res.status(500).json({ error: 'Internal server error' });
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); });
        // Get available permissions
        router.get('/admin/permissions', isAdmin(), function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                res.json(exports.AVAILABLE_PERMISSIONS);
                return [2 /*return*/];
            });
        }); });
        return router;
    },
};
exports.default = permissionsModule;
