import * as reports from '../services/report.service.js';

const make = (build, name) => async (req, res) => {
  const { format, ...q } = req.valid.query;
  const report = await build(req.ctx, q);
  await reports.send(res, report, format, name);
};

export const reportCtl = {
  barber: make(reports.barberReport, 'relatorio-barbeiro'),
  unit: make(reports.unitReport, 'relatorio-unidade'),
  consolidated: make(reports.consolidatedReport, 'relatorio-consolidado'),
};
