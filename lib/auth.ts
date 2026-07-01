// lib/auth.ts
import { NextAuthOptions, getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './prisma';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().min(1), // Nicht mehr nur email, sondern auch Name möglich
  password: z.string().min(1),
});

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'E-Mail oder Name', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const { email, password } = loginSchema.parse(credentials);
          
          // Versuche zuerst mit E-Mail, dann mit Name zu finden
          let user = await prisma.user.findUnique({
            where: { email },
          });
          
          // Wenn nicht gefunden, versuche mit Name
          if (!user) {
            user = await prisma.user.findFirst({
              where: { name: email },
            });
          }
          
          if (!user) {
            return null;
          }
          
          const isValidPassword = await bcrypt.compare(password, user.passwordHash);
          
          if (!isValidPassword) {
            return null;
          }
          
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user && 'role' in user) {
        token.role = user.role as string;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/signin',
  },
};

// Export auth function
export const auth = async () => getServerSession(authOptions);