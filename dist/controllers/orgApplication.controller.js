"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApplication = createApplication;
exports.getApplications = getApplications;
exports.deleteApplication = deleteApplication;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const snowflake_ts_1 = require("../utils/snowflake.ts");
async function createApplication(req, res) {
    try {
        const { organizationName, legalName, registrationNumber, address, emailAddress, walletAddress } = req.body;
        if (!organizationName || !legalName || !registrationNumber || !address || !emailAddress || !walletAddress) {
            return res.status(400).json({ error: "All fields are required" });
        }
        await db_ts_1.default.orgApplication.create({
            data: { id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(), organizationName, legalName, registrationNumber, address, emailAddress, walletAddress },
        });
        return res.status(201).json({ success: true, message: "Application submitted successfully" });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Internal server error" });
    }
}
async function getApplications(req, res) {
    try {
        const applications = await db_ts_1.default.orgApplication.findMany();
        const apps = applications.map((e) => ({
            ...e,
            id: e.id.toString()
        }));
        return res.status(200).json({ success: true, applications: apps });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Internal server error" });
    }
}
async function deleteApplication(req, res) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: "Application ID is required" });
        }
        await db_ts_1.default.orgApplication.delete({ where: { id: Number(id) } });
        return res.status(200).json({ success: true, message: "Application deleted successfully" });
    }
    catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=orgApplication.controller.js.map