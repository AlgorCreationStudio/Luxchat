import { type Express, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || "luxchat-secret-key-change-in-production";

export interface AuthRequest extends Request {
  userId?: string;
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No autorizado" });
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
  req.userId = payload.userId;
  next();
}

export function registerAuthRoutes(app: Express) {
  // REGISTER
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { displayName, email, password } = req.body;

      if (!displayName?.trim() || !email?.trim() || !password) {
        return res.status(400).json({ message: "Todos los campos son requeridos" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
      }

      // Check if email already exists
      const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      if (existing) {
        return res.status(400).json({ message: "Este email ya está registrado" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const [user] = await db.insert(users).values({
        displayName: displayName.trim(),
        email: email.toLowerCase(),
        passwordHash,
        status: "online",
      }).returning();

      const token = generateToken(user.id);
      const { passwordHash: _, ...safeUser } = user;
      return res.status(201).json({ user: safeUser, token });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // LOGIN
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email?.trim() || !password) {
        return res.status(400).json({ message: "Email y contraseña son requeridos" });
      }

      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Email o contraseña incorrectos" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Email o contraseña incorrectos" });
      }

      // Update status to online
      await db.update(users).set({ status: "online", lastSeen: new Date() }).where(eq(users.id, user.id));

      const token = generateToken(user.id);
      const { passwordHash: _, ...safeUser } = user;
      return res.status(200).json({ user: safeUser, token });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  // ME - get current user from token
  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.userId!));
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      const { passwordHash: _, ...safeUser } = user;
      return res.status(200).json(safeUser);
    } catch (err) {
      return res.status(500).json({ message: "Error interno del servidor" });
    }
  });
}
