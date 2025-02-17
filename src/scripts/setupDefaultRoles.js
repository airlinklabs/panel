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
var client_1 = require("@prisma/client");
var permissions_1 = require("../modules/admin/permissions");
var prisma = new client_1.PrismaClient();
function setupDefaultRoles() {
    return __awaiter(this, void 0, void 0, function () {
        var roles, _i, roles_1, roleData, role, adminRole, adminUsers, _a, adminUsers_1, user, userRole, regularUsers, _b, regularUsers_1, user, error_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 17, 18, 20]);
                    roles = [
                        {
                            name: 'Administrator',
                            description: 'Full access to all features',
                            permissions: Object.values(permissions_1.AVAILABLE_PERMISSIONS)
                        },
                        {
                            name: 'Server Manager',
                            description: 'Can manage servers and view server resources',
                            permissions: [
                                permissions_1.AVAILABLE_PERMISSIONS.USER_CREATE_SERVER,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_DELETE_SERVER,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_MODIFY_SERVER,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_VIEW_SERVERS,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_ACCESS_SFTP,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_ACCESS_CONSOLE,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_VIEW_STARTUP,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_EDIT_STARTUP
                            ]
                        },
                        {
                            name: 'User',
                            description: 'Basic user access',
                            permissions: [
                                permissions_1.AVAILABLE_PERMISSIONS.USER_VIEW_SERVERS,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_ACCESS_CONSOLE,
                                permissions_1.AVAILABLE_PERMISSIONS.USER_VIEW_STARTUP
                            ]
                        }
                    ];
                    _i = 0, roles_1 = roles;
                    _c.label = 1;
                case 1:
                    if (!(_i < roles_1.length)) return [3 /*break*/, 4];
                    roleData = roles_1[_i];
                    return [4 /*yield*/, prisma.role.create({
                            data: {
                                name: roleData.name,
                                description: roleData.description,
                                permissions: {
                                    create: roleData.permissions.map(function (permission) { return ({
                                        permission: permission
                                    }); })
                                }
                            }
                        })];
                case 2:
                    role = _c.sent();
                    console.log("Created role: ".concat(role.name));
                    _c.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [4 /*yield*/, prisma.role.findUnique({
                        where: { name: 'Administrator' }
                    })];
                case 5:
                    adminRole = _c.sent();
                    if (!adminRole) return [3 /*break*/, 10];
                    return [4 /*yield*/, prisma.users.findMany({
                            where: { isAdmin: true }
                        })];
                case 6:
                    adminUsers = _c.sent();
                    _a = 0, adminUsers_1 = adminUsers;
                    _c.label = 7;
                case 7:
                    if (!(_a < adminUsers_1.length)) return [3 /*break*/, 10];
                    user = adminUsers_1[_a];
                    return [4 /*yield*/, prisma.userRole.create({
                            data: {
                                userId: user.id,
                                roleId: adminRole.id
                            }
                        })];
                case 8:
                    _c.sent();
                    console.log("Assigned Administrator role to user: ".concat(user.email));
                    _c.label = 9;
                case 9:
                    _a++;
                    return [3 /*break*/, 7];
                case 10: return [4 /*yield*/, prisma.role.findUnique({
                        where: { name: 'User' }
                    })];
                case 11:
                    userRole = _c.sent();
                    if (!userRole) return [3 /*break*/, 16];
                    return [4 /*yield*/, prisma.users.findMany({
                            where: { isAdmin: false }
                        })];
                case 12:
                    regularUsers = _c.sent();
                    _b = 0, regularUsers_1 = regularUsers;
                    _c.label = 13;
                case 13:
                    if (!(_b < regularUsers_1.length)) return [3 /*break*/, 16];
                    user = regularUsers_1[_b];
                    return [4 /*yield*/, prisma.userRole.create({
                            data: {
                                userId: user.id,
                                roleId: userRole.id
                            }
                        })];
                case 14:
                    _c.sent();
                    console.log("Assigned User role to user: ".concat(user.email));
                    _c.label = 15;
                case 15:
                    _b++;
                    return [3 /*break*/, 13];
                case 16:
                    console.log('Default roles and permissions setup completed successfully');
                    return [3 /*break*/, 20];
                case 17:
                    error_1 = _c.sent();
                    console.error('Error setting up default roles:', error_1);
                    return [3 /*break*/, 20];
                case 18: return [4 /*yield*/, prisma.$disconnect()];
                case 19:
                    _c.sent();
                    return [7 /*endfinally*/];
                case 20: return [2 /*return*/];
            }
        });
    });
}
setupDefaultRoles();
