import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import type { User } from "@/interface/IDatatable";
import NextAuth from "next-auth";
//import type { NextAuthOptions } from 'next-auth'

//export const authOptions: NextAuthOptions = {
//export const authOptions = {
export const authOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials, req) {
                try {
                    console.log("🔍 Received credentials:", credentials);
                    const parsedCredentials = z
                        .object({ username: z.string(), password: z.string() })
                        .safeParse(credentials);

                    if (!parsedCredentials.success) {
                        console.log("Invalid input format");
                        return null;
                    }

                    const { username, password } = parsedCredentials.data;
                    
                    const API_URL = process.env.NEXT_PUBLIC_Django_API_URL;

                    if (!API_URL) {
                        console.error("API URL is not set!");
                        return null;
                    }

                    try {
                        const response = await fetch(`${API_URL}/account/users/`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ username, password }),
                        });
    
                        if (!response.ok) {
                            console.log("Invalid credentials");
                            return null;
                        }

                        const user: User = await response.json();

                        // Also obtain a JWT token for API calls
                        let accessToken: string | null = null;
                        try {
                            const tokenRes = await fetch(`${API_URL}/api/token/`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ username, password }),
                            });
                            if (tokenRes.ok) {
                                const tokenData = await tokenRes.json();
                                accessToken = tokenData.access;
                            }
                        } catch {}

                        return {
                            ...user,
                            id: user.id.toString(),
                            username: user.username,
                            role: user.role,
                            accessToken,
                        } as any;
                    } catch (error) {
                        console.error("Error in authorization:", error);
                        return null;
                    }
                    //sends a GET request to ${API_URL}/account/users/?username=${username}
                    // const user = await getUser(username);
                    // if (!user || !user.password) {
                    //     console.log("User not found or missing password");
                    //     return null;
                    // }

                    // return {
                    //     ...user,
                    //     id: user.id.toString(), // Ensure ID is string type
                    //     username: user.username,
                    //     role: user.role,
                    // };
                } catch (error) {
                    console.error("Error in authorization:", error);
                    return null;
                }
            },
        }),
    ],
    pages: {
        signIn: "/login",   // Redirect if not authenticated
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = (user as any).role ?? "user";
                token.name = (user as any).username;
                token.accessToken = (user as any).accessToken ?? null;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.role = (token.role as string) ?? "user";
                session.user.name = (token.name as string) ?? null;
                (session as any).accessToken = token.accessToken ?? null;
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
};

async function getUser(username: string) {
    const API_URL = process.env.NEXT_PUBLIC_Django_API_URL;

    if (!API_URL) {
        console.error("API URL is not set!");
        return null;
    }

    try {
        const response = await fetch(`${API_URL}/account/users/?username=${username}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.status} - ${response.statusText}`);
        }

        const data: User[] = await response.json();
        return data.length > 0 ? data[0] : null;
    } catch (error) {
        console.error("Unexpected error:", error);
        return null;
    }
}


