import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import prisma from "../config/db";
import { generateSnowflakeIdBigInt } from "../utils/snowflake";



export async function createApplication (req: AuthenticatedRequest, res: Response)  {

  try {
    
    const {organizationName, legalName, registrationNumber, address, emailAddress, walletAddress} = req.body;
    if(!organizationName || !legalName || !registrationNumber || !address || !emailAddress || !walletAddress) {
      return res.status(400).json({error: "All fields are required"});
    }
  
    await prisma.orgApplication.create({
      data: {id:generateSnowflakeIdBigInt(),organizationName, legalName, registrationNumber, address, emailAddress, walletAddress},
    });
  
    return res.status(201).json({success: true, message: "Application submitted successfully"});
  } catch (error) {
    console.log(error);
    return res.status(500).json({error: "Internal server error"});
  }

}


export async function getApplications (req: AuthenticatedRequest, res: Response)  {
    try {
        const applications = await prisma.orgApplication.findMany();
        const apps = applications.map((e) => ({
          ...e,
          id: e.id.toString()
        }));
        return res.status(200).json({success: true, applications: apps});
    } catch (error) {
      console.log(error)
        return res.status(500).json({error: "Internal server error"});
    }
}

export async function deleteApplication (req: AuthenticatedRequest, res: Response)  {
    try {
        const {id} = req.params;
        if(!id) {
            return res.status(400).json({error: "Application ID is required"});
        }
        await prisma.orgApplication.delete({where: { id: Number(id) }});
        return res.status(200).json({success: true, message: "Application deleted successfully"});
    } catch (error) {
        return res.status(500).json({error: "Internal server error"});
    }
}