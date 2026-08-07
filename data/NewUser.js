import sql from './db.js'


export async function newUser(email, role, consentstate)
{
    let user = await sql`
        INSERT INTO users (email, role, consentstate, createdat)
        VALUES (${email}, ${role}, ${consentstate}, now())
    `;
}
