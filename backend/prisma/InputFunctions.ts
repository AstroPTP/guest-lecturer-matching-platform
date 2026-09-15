import { ExpertiseDto  } from "src/guest-speakers/dto/expertise.dto";
import { BasicInformationDto } from "src/guest-speakers/dto/basic-information.dto";
import { ScheduleDto } from "src/guest-speakers/dto/engagement.dto";
import { EngagementDto } from "src/guest-speakers/dto/engagement.dto";

import { UCExpertiseDto  } from "src/unit-coordinators/dto/expertise.dto";
import { UCBasicInformationDto } from "src/unit-coordinators/dto/basic-information.dto";
import { UCScheduleDto } from "src/unit-coordinators/dto/engagement.dto";
import { UCEngagementDto } from "src/unit-coordinators/dto/engagement.dto";


import { CreateUserProfileDto } from "src/users/dto/create-user-profile.dto";

import { PrismaClient } from "./generated/prisma"
import { PrismaPg, PrismaPG} from "@prisma/adapter-pg"

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL
});

export const prisma = new PrismaClient({adapter});

export async function newUser(user: CreateUserProfileDto)
{
    const newUser = await prisma.user.create({
        data: {
            userid: user.uuid,
            userauthid: user.auth0Id,
            email: user.email, 
            role: user.role, 
            consentstate: user.consentstate,
            createdat: user.createdAt
        },
    });
}

export async function newGuestProfile(expertise: ExpertiseDto, user: CreateUserProfileDto, basic: BasicInformationDto, schedule: ScheduleDto, engagement: EngagementDto)
{
    const newUser = await prisma.guest.create({
        data: {
            guest_id: guest.speakerId,
            user_id: user.uuid,
            first_name: basic.firstName, 
            last_name: basic.lastName, 
            field: basic.professionalField, 
            role: basic.professionalRole, 
            bio: basic.bio, 
            prior_details: expertise.speakingDetails, 
            international_details: expertise.internationalDetails, 
            linkedin_profile: expertise.linkedin, 
            location: engagement.primaryLocation, 
            duration: engagement.sessionDuration, 
            audience: engagement.audienceSize
        },
    });

    for (const topic of expertise.selectedTopics) {
    await prisma.user-expertise.create({
        data: {
            userId: user.uuid,
            expertise: topic
        }
    });

    const availability = {
        monday: schedule.availableDays.includes("Monday"),
        tuesday: schedule.availableDays.includes("Tuesday"),
        wednesday: schedule.availableDays.includes("Wednesday"),
        thursday: schedule.availableDays.includes("Thursday"),
        friday: schedule.availableDays.includes("Friday")
    };

    const availableFrom = new Date(`1970-01-01T${schedule.availableFrom}:00`);
    const availableTo = new Date(`1970-01-01T${schedule.availableTo}:00`);

    await prisma.availability.create({
        data: {
            userId: user.uuid,
            ...availability,
            available_from: availableFrom,
            available_to: availableTo,
            frequency: schedule.availabilityFrequency,
            notes: schedule.availabilityNotes
        }
    });
}
}

export async function newUCProfile(expertise: UCExpertiseDto, user: CreateUserProfileDto, basic: UCBasicInformationDto, schedule: UCScheduleDto, engagement: UCEngagementDto)
{
    const newUser = await prisma.guest.create({
        data: {
            guest_id: guest.speakerId,
            user_id: user.uuid,
            first_name: basic.firstName, 
            last_name: basic.lastName, 
            faculty: basic.schoolDepartment, 
            role: basic.academicRole, 
            bio: basic.bio, 
            prior_details: expertise.speakingDetails, 
            international_details: expertise.internationalDetails, 
            linkedin_profile: expertise.linkedin, 
            location: engagement.primaryLocation, 
            duration: engagement.sessionDuration, 
            audience: engagement.audienceSize
        },
    });

    for (const topic of expertise.selectedTopics) {
    await prisma.user-expertise.create({
        data: {
            userId: user.uuid,
            expertise: topic
        }
    });

    const availability = {
        monday: schedule.preferedDays.includes("Monday"),
        tuesday: schedule.preferedDays.includes("Tuesday"),
        wednesday: schedule.preferedDays.includes("Wednesday"),
        thursday: schedule.preferedDays.includes("Thursday"),
        friday: schedule.preferedDays.includes("Friday")
    };

    const availableFrom = new Date(`1970-01-01T${schedule.preferedFrom}:00`);
    const availableTo = new Date(`1970-01-01T${schedule.preferedTo}:00`);

    await prisma.availability.create({
        data: {
            userId: user.uuid,
            ...availability,
            available_from: availableFrom,
            available_to: availableTo,
            frequency: schedule.engagementFrequency,
            notes: schedule.scheduleNotes
        }
    });
}
}

