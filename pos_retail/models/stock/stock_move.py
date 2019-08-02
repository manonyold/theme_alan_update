# -*- coding: utf-8 -*-
from odoo import fields, api, models
import json

import logging

_logger = logging.getLogger(__name__)


class stock_move(models.Model):
    _inherit = "stock.move"

    # @api.model
    # def create(self, vals):
    #     """
    #         if move create from pos order line
    #         and pol have uom ID and pol uom ID difference with current move
    #         we'll re-update product_uom of move
    #         FOR linked stock on hand of product
    #     """
    #     move = super(stock_move, self).create(vals)
    #     order_lines = self.env['pos.order.line'].search([
    #         ('name', '=', move.name),
    #         ('product_id', '=', move.product_id.id),
    #         ('qty', '=', move.product_uom_qty)
    #     ])
    #     for line in order_lines:
    #         if line.uom_id and line.uom_id != move.product_uom:
    #             move_product_uom_qty = move.product_uom_qty
    #             base_uom = move.product_id.uom_id
    #             line_uom = line.uom_id
    #             if base_uom.category_id == line_uom.category_id:
    #                 qty = move_product_uom_qty * (line_uom.factor_inv / move.product_id.uom_id.factor_inv)
    #                 _logger.info('covert %s %s to %s %s' % (
    #                     move_product_uom_qty, line.uom_id.name, qty, move.product_id.uom_id.name))
    #                 move.write({
    #                     'product_uom_qty': qty
    #                 })
    #     return move

    @api.model
    def get_stock_datas(self, location_id, product_need_update_onhand=[]):
        values = {}
        product_object = self.env['product.product'].sudo()
        if not product_need_update_onhand:
            datas = product_object.with_context({'location': location_id}).search_read(
                [('type', '=', 'product'), ('available_in_pos', '=', True)], ['qty_available'])
        else:
            datas = product_object.with_context({'location': location_id}).search_read(
                [('id', 'in', product_need_update_onhand)],
                ['name', 'qty_available', 'default_code'])
        for data in datas:
            values[data['id']] = data['qty_available']
        return values
