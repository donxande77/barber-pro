// Controllers do painel: apenas ligam a requisição validada ao serviço correspondente.
import { handle } from './handler.js';
import { forbidden } from '../utils/errors.js';
import * as units from '../services/unit.service.js';
import * as site from '../services/site.service.js';
import * as clients from '../services/client.service.js';
import * as barbers from '../services/barber.service.js';
import * as catalog from '../services/catalog.service.js';
import * as appts from '../services/appointment.service.js';
import * as sales from '../services/sale.service.js';
import * as comp from '../services/compensation.service.js';
import * as fin from '../services/finance.service.js';
import * as dash from '../services/dashboard.service.js';
import * as pub from '../services/public.service.js';
import * as posts from '../services/post.service.js';

const p = (v) => v.params;
const b = (v) => v.body;
const q = (v) => v.query;

export const company = {
  get: handle((ctx) => units.getCompany(ctx)),
  update: handle((ctx, v) => units.updateCompany(ctx, b(v))),
};

export const unitCtl = {
  list: handle((ctx) => units.listUnits(ctx)),
  get: handle((ctx, v) => units.getUnit(ctx, p(v).unitId)),
  create: handle((ctx, v) => units.createUnit(ctx, b(v)), 201),
  update: handle((ctx, v) => units.updateUnit(ctx, p(v).unitId, b(v))),
};

export const siteCtl = {
  published: handle((ctx) => site.getPublishedConfig(ctx.user.companyId)),
  versions: handle((ctx) => site.listVersions(ctx)),
  version: handle((ctx, v) => site.getVersion(ctx, p(v).id)),
  draft: handle(async (ctx) => (await site.getDraft(ctx)) ?? null),
  saveDraft: handle((ctx, v) => site.saveDraft(ctx, b(v))),
  discardDraft: handle((ctx) => site.discardDraft(ctx), 204),
  publish: handle((ctx) => site.publishDraft(ctx)),
  restore: handle((ctx, v) => site.restoreVersion(ctx, p(v).id), 201),
  upload: handle((ctx, v) => site.saveUpload(ctx, b(v)), 201),
};

export const clientCtl = {
  list: handle((ctx, v) => clients.listClients(ctx, q(v))),
  get: handle((ctx, v) => clients.getClient(ctx, p(v).id)),
  create: handle((ctx, v) => clients.createClient(ctx, b(v)), 201),
  update: handle((ctx, v) => clients.updateClient(ctx, p(v).id, b(v))),
  anonymize: handle((ctx, v) => clients.anonymizeClient(ctx, p(v).id)),
};

export const barberCtl = {
  list: handle((ctx, v) => barbers.listBarbers(ctx, q(v))),
  get: handle((ctx, v) => barbers.getBarber(ctx, p(v).id)),
  create: handle((ctx, v) => barbers.createBarber(ctx, b(v)), 201),
  update: handle((ctx, v) => barbers.updateBarber(ctx, p(v).id, b(v))),
  setLogin: handle((ctx, v) => barbers.setBarberLogin(ctx, p(v).id, b(v))),
  disableLogin: handle((ctx, v) => barbers.disableBarberLogin(ctx, p(v).id), 204),
  schedule: handle((ctx, v) => barbers.setSchedule(ctx, p(v).id, p(v).unitId, b(v))),
  addTimeOff: handle((ctx, v) => barbers.addTimeOff(ctx, p(v).id, b(v)), 201),
  removeTimeOff: handle((ctx, v) => barbers.removeTimeOff(ctx, p(v).id, p(v).timeOffId), 204),
};

export const catalogCtl = {
  categories: handle((ctx) => catalog.listCategories(ctx)),
  createCategory: handle((ctx, v) => catalog.createCategory(ctx, b(v)), 201),
  updateCategory: handle((ctx, v) => catalog.updateCategory(ctx, p(v).id, b(v))),
  deleteCategory: handle((ctx, v) => catalog.deleteCategory(ctx, p(v).id), 204),
  services: handle((ctx, v) => catalog.listServices(ctx, q(v))),
  service: handle((ctx, v) => catalog.getService(ctx, p(v).id)),
  createService: handle((ctx, v) => catalog.createService(ctx, b(v)), 201),
  updateService: handle((ctx, v) => catalog.updateService(ctx, p(v).id, b(v))),
  products: handle((ctx, v) => catalog.listProducts(ctx, q(v))),
  createProduct: handle((ctx, v) => catalog.createProduct(ctx, b(v)), 201),
  updateProduct: handle((ctx, v) => catalog.updateProduct(ctx, p(v).id, b(v))),
  adjustStock: handle((ctx, v) => catalog.adjustStock(ctx, p(v).id, b(v))),
  transferStock: handle((ctx, v) => catalog.transferStock(ctx, p(v).id, b(v))),
  movements: handle((ctx, v) => catalog.listStockMovements(ctx, p(v).id, q(v))),
};

export const agendaCtl = {
  availability: handle((ctx, v) => {
    const { unitId } = q(v);
    if (!ctx.unitIds.includes(unitId)) throw forbidden('Unidade fora do seu acesso.');
    return appts.computeSlots(q(v));
  }),
  list: handle((ctx, v) => appts.listAppointments(ctx, q(v))),
  get: handle((ctx, v) => appts.getAppointment(ctx, p(v).id)),
  create: handle((ctx, v) => {
    const d = b(v);
    if (!ctx.unitIds.includes(d.unitId)) throw forbidden('Unidade fora do seu acesso.');
    return appts.createAppointment({ ctx, ...d, source: 'INTERNAL' });
  }, 201),
  reschedule: handle((ctx, v) => appts.rescheduleAppointment(ctx, p(v).id, b(v))),
  status: handle((ctx, v) => appts.setStatus(ctx, p(v).id, b(v))),
};

export const saleCtl = {
  list: handle((ctx, v) => sales.listSales(ctx, q(v))),
  get: handle((ctx, v) => sales.getSale(ctx, p(v).id)),
  create: handle((ctx, v) => sales.createSale(ctx, b(v)), 201),
  addItem: handle((ctx, v) => sales.addItem(ctx, p(v).id, b(v))),
  updateItem: handle((ctx, v) => sales.updateItem(ctx, p(v).id, p(v).itemId, b(v))),
  removeItem: handle((ctx, v) => sales.removeItem(ctx, p(v).id, p(v).itemId)),
  close: handle((ctx, v) => sales.closeSale(ctx, p(v).id)),
  cancel: handle((ctx, v) => sales.cancelSale(ctx, p(v).id, b(v))),
  pay: handle((ctx, v) => sales.addPayment(ctx, p(v).id, b(v)), 201),
  reversePayment: handle((ctx, v) => sales.reversePayment(ctx, p(v).id, b(v))),
};

export const compCtl = {
  rules: handle((ctx, v) => comp.listRules(ctx, q(v))),
  createRule: handle((ctx, v) => comp.createRule(ctx, b(v)), 201),
  endRule: handle((ctx, v) => comp.endRule(ctx, p(v).id, b(v))),
  periodic: handle((ctx, v) => comp.generatePeriodic(ctx, b(v)), 201),
  obligations: handle((ctx, v) => comp.listObligations(ctx, q(v))),
  createObligation: handle((ctx, v) => comp.createManualObligation(ctx, b(v)), 201),
  cancelObligation: handle((ctx, v) => comp.cancelObligation(ctx, p(v).id, b(v))),
  payouts: handle((ctx, v) => comp.listPayouts(ctx, q(v))),
  createPayout: handle((ctx, v) => comp.createPayout(ctx, b(v)), 201),
  statement: handle((ctx, v) => comp.barberStatement(ctx, q(v))),
};

export const finCtl = {
  accounts: handle((ctx, v) => fin.listAccounts(ctx, q(v))),
  createAccount: handle((ctx, v) => fin.createAccount(ctx, b(v)), 201),
  updateAccount: handle((ctx, v) => fin.updateAccount(ctx, p(v).id, b(v))),
  categories: handle((ctx) => fin.listCategories(ctx)),
  createCategory: handle((ctx, v) => fin.createCategory(ctx, b(v)), 201),
  transactions: handle((ctx, v) => fin.listTransactions(ctx, q(v))),
  createTransaction: handle((ctx, v) => fin.createTransaction(ctx, b(v)), 201),
  reverseTransaction: handle((ctx, v) => fin.reverseTransaction(ctx, p(v).id, b(v)), 201),
  bills: handle((ctx, v) => fin.listBills(ctx, q(v))),
  createBill: handle((ctx, v) => fin.createBill(ctx, b(v)), 201),
  payBill: handle((ctx, v) => fin.payBill(ctx, p(v).id, b(v)), 201),
  cancelBill: handle((ctx, v) => fin.cancelBill(ctx, p(v).id)),
  transfers: handle((ctx, v) => fin.listTransfers(ctx, q(v))),
  createTransfer: handle((ctx, v) => fin.createTransfer(ctx, b(v)), 201),
  reverseTransfer: handle((ctx, v) => fin.reverseTransfer(ctx, p(v).id, b(v))),
  closings: handle((ctx, v) => fin.listClosings(ctx, q(v))),
  closeCash: handle((ctx, v) => fin.closeCash(ctx, b(v)), 201),
  summary: handle((ctx, v) => fin.financeSummary(ctx, q(v))),
  consolidated: handle((ctx, v) => fin.consolidated(ctx, q(v))),
};

export const dashCtl = {
  owner: handle((ctx, v) => dash.ownerDashboard(ctx, q(v))),
  manager: handle((ctx, v) => dash.managerDashboard(ctx, q(v))),
  barber: handle((ctx, v) => dash.barberDashboard(ctx, q(v))),
};

export const reviewCtl = {
  list: handle((ctx, v) => pub.listReviews(ctx, q(v))),
  moderate: handle((ctx, v) => pub.moderateReview(ctx, p(v).id, b(v))),
};

export const postCtl = {
  list: handle((ctx, v) => posts.listPosts(ctx, q(v))),
  create: handle((ctx, v) => posts.createPost(ctx, b(v)), 201),
  update: handle((ctx, v) => posts.updatePost(ctx, p(v).id, b(v))),
  remove: handle((ctx, v) => posts.deletePost(ctx, p(v).id), 204),
};
