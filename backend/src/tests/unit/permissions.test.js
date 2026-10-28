import { describe, it, expect } from 'vitest';
import { can, permissionsOf, MANAGEABLE_ROLES } from '../../services/permissions.js';

const u = (role) => ({ role });

describe('matriz de permissões', () => {
  it('somente o proprietário vê o consolidado e a auditoria', () => {
    expect(can(u('OWNER'), 'finance:consolidated:read')).toBe(true);
    for (const r of ['MANAGER', 'RECEPTIONIST', 'BARBER']) {
      expect(can(u(r), 'finance:consolidated:read')).toBe(false);
      expect(can(u(r), 'audit:read')).toBe(false);
    }
  });

  it('barbeiro só tem acesso ao próprio financeiro', () => {
    expect(can(u('BARBER'), 'finance:own:read')).toBe(true);
    expect(can(u('BARBER'), 'finance:unit:read')).toBe(false);
  });

  it('recepcionista agenda, mas não mexe no financeiro', () => {
    expect(can(u('RECEPTIONIST'), 'appointments:manage')).toBe(true);
    expect(permissionsOf('RECEPTIONIST').some((p) => p.startsWith('finance:'))).toBe(false);
  });

  it('gerente não cria proprietários nem gerentes', () => {
    expect(MANAGEABLE_ROLES.MANAGER).toEqual(['RECEPTIONIST']);
  });

  it('permissão desconhecida é erro de programação', () => {
    expect(() => can(u('OWNER'), 'nao:existe')).toThrow();
  });

  it('sem usuário, nada é permitido', () => {
    expect(can(null, 'units:read')).toBe(false);
  });
});
