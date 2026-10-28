import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { requireAuth, requirePermission as perm } from '../middlewares/auth.js';
import { idParams, unitParams, uuid, partialNoDefaults } from '../validators/common.js';
import { createUnitBody, updateUnitBody, companyBody } from '../validators/unit.validators.js';
import { draftBody, uploadBody } from '../validators/site.validators.js';
import * as cv from '../validators/catalog.validators.js';
import * as ov from '../validators/ops.validators.js';
import {
  company, unitCtl, siteCtl, clientCtl, barberCtl, catalogCtl, agendaCtl, saleCtl, compCtl, finCtl, dashCtl, reviewCtl, postCtl,
} from '../controllers/admin.controller.js';
import { reportCtl } from '../controllers/report.controller.js';

export const admin = Router();
const V = validate;
const unitQuery = z.object({ unitId: uuid.optional() });

// Empresa e unidades
admin.get('/company', requireAuth, company.get);
admin.patch('/company', perm('company:manage'), V({ body: companyBody }), company.update);
admin.get('/units', perm('units:read'), unitCtl.list);
admin.post('/units', perm('units:create'), V({ body: createUnitBody }), unitCtl.create);
admin.get('/units/:unitId', perm('units:read'), V({ params: unitParams }), unitCtl.get);
admin.patch('/units/:unitId', perm('units:update'), V({ params: unitParams, body: updateUnitBody }), unitCtl.update);

// Site e personalização
admin.get('/site/published', perm('site:manage'), siteCtl.published);
admin.get('/site/versions', perm('site:manage'), siteCtl.versions);
admin.get('/site/versions/:id', perm('site:manage'), V({ params: idParams }), siteCtl.version);
admin.post('/site/versions/:id/restore', perm('site:manage'), V({ params: idParams }), siteCtl.restore);
admin.get('/site/draft', perm('site:manage'), siteCtl.draft);
admin.put('/site/draft', perm('site:manage'), V({ body: draftBody }), siteCtl.saveDraft);
admin.delete('/site/draft', perm('site:manage'), siteCtl.discardDraft);
admin.post('/site/publish', perm('site:manage'), siteCtl.publish);
admin.post('/uploads', perm('mural:submit'), V({ body: uploadBody }), siteCtl.upload);

// Mural de cortes (barbeiro envia os próprios; gestão publica)
admin.get('/posts', perm('mural:submit'), V({ query: ov.postListQuery }), postCtl.list);
admin.post('/posts', perm('mural:submit'), V({ body: ov.postBody }), postCtl.create);
admin.patch('/posts/:id', perm('mural:submit'), V({ params: idParams, body: partialNoDefaults(ov.postBody) }), postCtl.update);
admin.delete('/posts/:id', perm('mural:submit'), V({ params: idParams }), postCtl.remove);

// Clientes
admin.get('/clients', perm('clients:read'), V({ query: cv.clientListQuery }), clientCtl.list);
admin.post('/clients', perm('clients:manage'), V({ body: cv.clientBody }), clientCtl.create);
admin.get('/clients/:id', perm('clients:read'), V({ params: idParams }), clientCtl.get);
admin.patch('/clients/:id', perm('clients:manage'), V({ params: idParams, body: cv.clientUpdateBody }), clientCtl.update);
admin.post('/clients/:id/anonymize', perm('company:manage'), V({ params: idParams }), clientCtl.anonymize);

// Barbeiros (leitura liberada à recepção para montar a agenda)
admin.get('/barbers', perm('appointments:manage'), V({ query: unitQuery }), barberCtl.list);
admin.post('/barbers', perm('barbers:manage'), V({ body: cv.barberBody }), barberCtl.create);
admin.get('/barbers/:id', perm('appointments:manage'), V({ params: idParams }), barberCtl.get);
admin.patch('/barbers/:id', perm('barbers:manage'), V({ params: idParams, body: cv.barberUpdateBody }), barberCtl.update);
admin.put('/barbers/:id/login', perm('barbers:manage'), V({ params: idParams, body: cv.barberLoginBody }), barberCtl.setLogin);
admin.delete('/barbers/:id/login', perm('barbers:manage'), V({ params: idParams }), barberCtl.disableLogin);
admin.put('/barbers/:id/schedules/:unitId', perm('barbers:manage'), V({ params: cv.barberUnitParams, body: cv.scheduleBody }), barberCtl.schedule);
admin.post('/barbers/:id/time-offs', perm('barbers:manage'), V({ params: idParams, body: cv.timeOffBody }), barberCtl.addTimeOff);
admin.delete('/barbers/:id/time-offs/:timeOffId', perm('barbers:manage'), V({ params: cv.barberTimeOffParams }), barberCtl.removeTimeOff);

// Serviços e categorias
admin.get('/service-categories', requireAuth, catalogCtl.categories);
admin.post('/service-categories', perm('company:manage'), V({ body: cv.categoryBody }), catalogCtl.createCategory);
admin.patch('/service-categories/:id', perm('company:manage'), V({ params: idParams, body: partialNoDefaults(cv.categoryBody) }), catalogCtl.updateCategory);
admin.delete('/service-categories/:id', perm('company:manage'), V({ params: idParams }), catalogCtl.deleteCategory);
admin.get('/services', requireAuth, V({ query: unitQuery }), catalogCtl.services);
admin.post('/services', perm('company:manage'), V({ body: cv.serviceBody }), catalogCtl.createService);
admin.get('/services/:id', requireAuth, V({ params: idParams }), catalogCtl.service);
admin.patch('/services/:id', perm('catalog:manage'), V({ params: idParams, body: cv.serviceUpdateBody }), catalogCtl.updateService);

// Produtos e estoque
admin.get('/products', requireAuth, V({ query: unitQuery }), catalogCtl.products);
admin.post('/products', perm('company:manage'), V({ body: cv.productBody }), catalogCtl.createProduct);
admin.patch('/products/:id', perm('company:manage'), V({ params: idParams, body: cv.productUpdateBody }), catalogCtl.updateProduct);
admin.post('/products/:id/stock', perm('stock:manage'), V({ params: idParams, body: cv.stockMoveBody }), catalogCtl.adjustStock);
admin.post('/products/:id/stock-transfer', perm('stock:manage'), V({ params: idParams, body: cv.stockTransferBody }), catalogCtl.transferStock);
admin.get('/products/:id/movements', perm('stock:manage'), V({ params: idParams, query: unitQuery }), catalogCtl.movements);

// Agenda
admin.get('/availability', perm('appointments:manage'), V({ query: ov.availabilityQuery }), agendaCtl.availability);
admin.get('/appointments', perm('appointments:read'), V({ query: ov.appointmentListQuery }), agendaCtl.list);
admin.post('/appointments', perm('appointments:manage'), V({ body: ov.internalBookingBody }), agendaCtl.create);
admin.get('/appointments/:id', perm('appointments:read'), V({ params: idParams }), agendaCtl.get);
admin.patch('/appointments/:id/reschedule', perm('appointments:manage'), V({ params: idParams, body: ov.rescheduleBody }), agendaCtl.reschedule);
admin.patch('/appointments/:id/status', perm('appointments:manage'), V({ params: idParams, body: ov.statusBody }), agendaCtl.status);

// Atendimentos, vendas e pagamentos
admin.get('/sales', perm('sales:manage'), V({ query: ov.saleListQuery }), saleCtl.list);
admin.post('/sales', perm('sales:manage'), V({ body: ov.saleCreateBody }), saleCtl.create);
admin.get('/sales/:id', perm('sales:manage'), V({ params: idParams }), saleCtl.get);
admin.post('/sales/:id/items', perm('sales:manage'), V({ params: idParams, body: ov.saleItemBody }), saleCtl.addItem);
admin.patch('/sales/:id/items/:itemId', perm('sales:manage'), V({ params: ov.saleItemParams, body: ov.saleItemUpdateBody }), saleCtl.updateItem);
admin.delete('/sales/:id/items/:itemId', perm('sales:manage'), V({ params: ov.saleItemParams }), saleCtl.removeItem);
admin.post('/sales/:id/close', perm('sales:manage'), V({ params: idParams }), saleCtl.close);
admin.post('/sales/:id/cancel', perm('sales:manage'), V({ params: idParams, body: ov.reasonBody }), saleCtl.cancel);
admin.post('/sales/:id/payments', perm('sales:manage'), V({ params: idParams, body: ov.paymentBody }), saleCtl.pay);
admin.post('/payments/:id/reverse', perm('finance:unit:manage'), V({ params: idParams, body: ov.reasonBody }), saleCtl.reversePayment);

// Remuneração
admin.get('/compensation/rules', perm('payouts:manage'), V({ query: ov.ruleListQuery }), compCtl.rules);
admin.post('/compensation/rules', perm('compensation:manage'), V({ body: ov.ruleBody }), compCtl.createRule);
admin.patch('/compensation/rules/:id/end', perm('compensation:manage'), V({ params: idParams, body: ov.endRuleBody }), compCtl.endRule);
admin.post('/compensation/periodic', perm('payouts:manage'), V({ body: ov.periodicBody }), compCtl.periodic);
admin.get('/compensation/obligations', perm('payouts:manage'), V({ query: ov.obligationListQuery }), compCtl.obligations);
admin.post('/compensation/obligations', perm('payouts:manage'), V({ body: ov.manualObligationBody }), compCtl.createObligation);
admin.post('/compensation/obligations/:id/cancel', perm('payouts:manage'), V({ params: idParams, body: ov.reasonBody }), compCtl.cancelObligation);
admin.get('/compensation/payouts', perm('payouts:manage'), V({ query: z.object({ barberId: uuid.optional(), unitId: uuid.optional() }) }), compCtl.payouts);
admin.post('/compensation/payouts', perm('payouts:manage'), V({ body: ov.payoutBody }), compCtl.createPayout);
admin.get('/compensation/statement', perm('reports:barber'), V({ query: ov.statementQuery }), compCtl.statement);

// Financeiro
admin.get('/finance/accounts', perm('finance:unit:read'), V({ query: unitQuery }), finCtl.accounts);
admin.get('/finance/accounts/options', perm('sales:manage'), V({ query: unitQuery }), finCtl.accounts); // recepção escolhe a conta ao receber
admin.post('/finance/accounts', perm('finance:unit:manage'), V({ body: ov.accountBody }), finCtl.createAccount);
admin.patch('/finance/accounts/:id', perm('finance:unit:manage'), V({ params: idParams, body: ov.accountUpdateBody }), finCtl.updateAccount);
admin.get('/finance/categories', perm('finance:unit:read'), finCtl.categories);
admin.post('/finance/categories', perm('company:manage'), V({ body: ov.finCategoryBody }), finCtl.createCategory);
admin.get('/finance/transactions', perm('finance:unit:read'), V({ query: ov.txListQuery }), finCtl.transactions);
admin.post('/finance/transactions', perm('finance:unit:manage'), V({ body: ov.txBody }), finCtl.createTransaction);
admin.post('/finance/transactions/:id/reverse', perm('finance:unit:manage'), V({ params: idParams, body: ov.reasonBody }), finCtl.reverseTransaction);
admin.get('/finance/bills', perm('finance:unit:read'), V({ query: ov.billListQuery }), finCtl.bills);
admin.post('/finance/bills', perm('finance:unit:manage'), V({ body: ov.billBody }), finCtl.createBill);
admin.post('/finance/bills/:id/pay', perm('finance:unit:manage'), V({ params: idParams, body: ov.billPayBody }), finCtl.payBill);
admin.post('/finance/bills/:id/cancel', perm('finance:unit:manage'), V({ params: idParams }), finCtl.cancelBill);
admin.get('/finance/transfers', perm('finance:unit:read'), V({ query: ov.periodQuery }), finCtl.transfers);
admin.post('/finance/transfers', perm('finance:unit:manage'), V({ body: ov.transferBody }), finCtl.createTransfer);
admin.post('/finance/transfers/:id/reverse', perm('finance:unit:manage'), V({ params: idParams, body: ov.reasonBody }), finCtl.reverseTransfer);
admin.get('/finance/closings', perm('finance:unit:read'), V({ query: ov.closingListQuery }), finCtl.closings);
admin.post('/finance/closings', perm('finance:unit:manage'), V({ body: ov.closingBody }), finCtl.closeCash);
admin.get('/finance/summary', perm('finance:unit:read'), V({ query: ov.periodQuery }), finCtl.summary);
admin.get('/finance/consolidated', perm('finance:consolidated:read'), V({ query: ov.periodQuery }), finCtl.consolidated);

// Dashboards
admin.get('/dashboard/owner', perm('finance:consolidated:read'), V({ query: ov.periodQuery }), dashCtl.owner);
admin.get('/dashboard/manager', perm('finance:unit:read'), V({ query: ov.periodQuery }), dashCtl.manager);
admin.get('/dashboard/barber', perm('finance:own:read'), V({ query: ov.periodQuery }), dashCtl.barber);

// Relatórios
admin.get('/reports/barber', perm('reports:barber'), V({ query: ov.barberReportQuery }), reportCtl.barber);
admin.get('/reports/unit', perm('reports:unit'), V({ query: ov.unitReportQuery }), reportCtl.unit);
admin.get('/reports/consolidated', perm('reports:consolidated'), V({ query: ov.consolidatedReportQuery }), reportCtl.consolidated);

// Avaliações
admin.get('/reviews', perm('reviews:moderate'), V({ query: z.object({ unitId: uuid.optional(), status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() }) }), reviewCtl.list);
admin.patch('/reviews/:id', perm('reviews:moderate'), V({ params: idParams, body: ov.moderateBody }), reviewCtl.moderate);
