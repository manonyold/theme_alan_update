# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _

class res_partner_credit(models.Model):
    _name = "res.partner.group"
    _description = "Customers group"

    name = fields.Char('Name', required=1)
    partner_ids = fields.Many2many('res.partner.group', 'res_partner_group_rel', 'group_id', 'partner_id',
                                 string='Customers')
