import { describe, it, expect } from 'vitest';
import { loginSchema, userSchema } from './schemas.js';

describe('validações do formulário', () => {
  it('login exige e-mail válido e senha', () => {
    expect(loginSchema.safeParse({ email: 'x', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('usuário não-proprietário precisa de unidade', () => {
    const base = { name: 'Ana', email: 'ana@b.com', password: 'SenhaBoa2026', unitIds: [] };
    expect(userSchema.safeParse({ ...base, role: 'MANAGER' }).success).toBe(false);
    expect(userSchema.safeParse({ ...base, role: 'OWNER' }).success).toBe(true);
    expect(userSchema.safeParse({ ...base, role: 'MANAGER', unitIds: ['u1'] }).success).toBe(true);
  });

  it('senha precisa de letras e números', () => {
    const base = { name: 'Ana', email: 'ana@b.com', role: 'OWNER', unitIds: [] };
    expect(userSchema.safeParse({ ...base, password: 'somenteletras' }).success).toBe(false);
  });
});
