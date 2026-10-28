import { handle } from './handler.js';
import * as pub from '../services/public.service.js';

export const publicCtl = {
  site: handle(() => pub.site()),
  catalog: handle((_ctx, v) => pub.unitCatalog(v.params.unitId)),
  availability: handle((_ctx, v) => pub.availability(v.query)),
  book: handle((_ctx, v) => pub.book(v.body), 201),
  manageInfo: handle((_ctx, v) => pub.manageInfo(v.params.token)),
  manageCancel: handle((_ctx, v) => pub.manageCancel(v.params.token, v.body.reason)),
  reviewInfo: handle((_ctx, v) => pub.reviewInfo(v.params.token)),
  submitReview: handle((_ctx, v) => pub.submitReview(v.params.token, v.body), 201),
};
