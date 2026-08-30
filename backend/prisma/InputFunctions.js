import { PrismaClient } from "./generated/prisma"
import { PrismaPg, PrismaPG} from "@prisma/adapter-pg"

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL
});

export const prisma = new PrismaClient({adapter});

export async function newUser(p_userAuthId, p_email, p_role, p_consentstate, p_createdat)
{
    const newUser = await prisma.user.create({
        data: {
            userauthid: p_userAuthId,
            email: p_email, 
            role: p_role, 
            consentstate: p_consentstate, 
            createdat: p_createdat
        },
    });
}

export async function newGuestProfile(p_userId, p_first_name, p_last_name, p_field, p_role, p_bio, p_prior_details, p_international_details, p_linkedIn_profile, p_location, p_duration, p_audience)
{
    const newUser = await prisma.guest.create({
        data: {
            user_id: p_userId, 
            first_name: p_first_name, 
            last_name: p_last_name, 
            field: p_field, 
            role: p_role, 
            bio: p_bio, 
            prior_details: p_prior_details, 
            international_details: p_international_details, 
            linkedin_profile: p_linkedIn_profile, 
            location: p_location, 
            duration: p_duration, 
            audience: p_audience
        },
    });
}

export async function newCoordinatorProfile(p_userId, p_first_name, p_last_name, p_faculty, p_role, p_bio, p_experience, p_discipline, p_learning_objective, p_location, p_duration, p_audience)
{
    const newUser = await prisma.coordinator.create({
        data: {
            user_id: p_userId, 
            first_name: p_first_name, 
            last_name: p_last_name, 
            faculty: p_faculty, 
            role: p_role, 
            bio: p_bio, 
            experience: p_experience, 
            discipline: p_discipline, 
            learning_objectives: p_learning_objective, 
            location: p_location, 
            duration: p_duration, 
            audience: p_audience
        },
    });
}

export async function assignExpertise(p_userId, p_expertise)
{
    const newUser = await prisma.expertise.create({
        data: {
            user_id: p_userId, 
            expetise: p_expertise
        },
    });
}

export async function setAvailability(p_userId, p_monday, p_tuesday, p_thursday, p_friday, p_start, p_end, p_frequency, p_notes)
{
    const newUser = await prisma.availability.create({
        data: {
            user_id: p_userId, 
            monday: p_monday,
            tuesday: p_tuesday,
            wednesday: p_wednesday,
            thursday: p_thursday,
            friday: p_friday,
            available_from: p_start,
            available_to: p_end,
            frequency: p_frequency,
            notes: p_notes
        },
    });
}