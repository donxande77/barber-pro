// Matriz de permissões por função. A verificação de UNIDADE é feita à parte (access.service.js):
// ter a permissão não basta — a unidade do recurso também precisa estar no escopo do usuário.

export const ROLES = ['OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER'];

export const PERMISSIONS = {
  // Empresa e unidades
  'company:manage': ['OWNER'],
  'units:create': ['OWNER'],
  'units:update': ['OWNER', 'MANAGER'],
  'units:read': ['OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER'],

  // Usuários
  'users:read': ['OWNER', 'MANAGER'],
  'users:manage': ['OWNER', 'MANAGER'], // gerente: só RECEPCIONISTAS das suas unidades

  // Site e personalização
  'site:manage': ['OWNER'],

  // Cadastros
  'clients:read': ['OWNER', 'MANAGER', 'RECEPTIONIST'],
  'clients:manage': ['OWNER', 'MANAGER', 'RECEPTIONIST'],
  'barbers:manage': ['OWNER', 'MANAGER'],
  'catalog:manage': ['OWNER', 'MANAGER'],
  'compensation:manage': ['OWNER'],

  // Agenda e atendimento
  'appointments:read': ['OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER'], // barbeiro: só a própria agenda
  'appointments:manage': ['OWNER', 'MANAGER', 'RECEPTIONIST'],
  'sales:manage': ['OWNER', 'MANAGER', 'RECEPTIONIST'],

  // Financeiro
  'finance:unit:read': ['OWNER', 'MANAGER'],
  'finance:unit:manage': ['OWNER', 'MANAGER'],
  'finance:consolidated:read': ['OWNER'],
  'finance:own:read': ['BARBER'], // somente os próprios dados
  'payouts:manage': ['OWNER', 'MANAGER'],

  // Relatórios e auditoria
  'reports:unit': ['OWNER', 'MANAGER'],
  'reports:consolidated': ['OWNER'],
  'audit:read': ['OWNER'],
};

export function can(user, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Permissão desconhecida: ${permission}`);
  return Boolean(user) && allowed.includes(user.role);
}

export function permissionsOf(role) {
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([p]) => p);
}

/**
 * Quais funções cada função pode criar/editar pelo módulo de usuários.
 * Acessos de BARBEIRO são criados no cadastro do barbeiro (vínculo com BarberUnit), não aqui.
 */
export const MANAGEABLE_ROLES = {
  OWNER: ['OWNER', 'MANAGER', 'RECEPTIONIST'],
  MANAGER: ['RECEPTIONIST'],
  RECEPTIONIST: [],
  BARBER: [],
};
