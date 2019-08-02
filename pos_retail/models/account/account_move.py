# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
import logging
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

class account_move(models.Model):

    _inherit = "account.move"

    # @api.multi
    # def assert_balanced(self):
    #     if not self.ids:
    #         return True
    #     prec = self.env.user.company_id.currency_id.decimal_places
    #
    #     self._cr.execute("""\
    #             SELECT      move_id
    #             FROM        account_move_line
    #             WHERE       move_id in %s
    #             GROUP BY    move_id
    #             HAVING      abs(sum(debit) - sum(credit)) > %s
    #             """, (tuple(self.ids), 10 ** (-max(5, prec))))
    #     _logger.info(10 ** (-max(5, prec)))
    #     _logger.info(10 ** (-max(5, prec)))
    #     result = self._cr.fetchall()
    #     _logger.info(result)
    #     if len(result) != 0:
    #         raise UserError(_("Cannot create unbalanced journal entry."))
    #     return True

class account_move_line(models.Model):
    _inherit = "account.move.line"

    @api.one
    def _prepare_analytic_line(self):
        analytic_line_value = super(account_move_line, self)._prepare_analytic_line()
        if analytic_line_value and analytic_line_value[0] and not analytic_line_value[0].get('name', None):
            analytic_line_value[0]['name'] = self.ref or self.move_id.ref
        return analytic_line_value[0]

    @api.model
    def create(self, vals):
        _logger.info('[starting] create move line with user: %s' % self.env.user.login)
        move_line = super(account_move_line, self).create(vals)
        return move_line
