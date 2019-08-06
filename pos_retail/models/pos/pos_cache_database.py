# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import json
import ast
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT
import odoo
from datetime import datetime, timedelta
import threading
import logging

_logger = logging.getLogger(__name__)


class pos_cache_database(models.Model):
    _name = "pos.cache.database"
    _description = "Management POS database"
    _rec_name = "res_id"
    _order = 'res_model'

    res_id = fields.Char('Id')
    res_model = fields.Char('Model')
    deleted = fields.Boolean('Deleted', default=0)

    # TODO: When pos session start each table, pos need call this function for get any modifiers from backend
    @api.multi
    def get_modifiers_backend(self, write_date, res_model, config_id=None):
        to_date = datetime.strptime(write_date, DEFAULT_SERVER_DATETIME_FORMAT) + timedelta(
            seconds=1)
        to_date = to_date.strftime(DEFAULT_SERVER_DATETIME_FORMAT)
        records = self.sudo().search([('write_date', '>', to_date), ('res_model', '=', res_model)])
        results = []
        for record in records:
            value = {
                'model': record.res_model,
                'id': int(record.res_id),
                'write_date': record.write_date
            }
            if record.deleted:
                value['deleted'] = True
                results.append(value)
            else:
                val = self.get_data(record.res_model, int(record.res_id), config_id)
                if val:
                    value.update(val)
                    results.append(value)
        return results

    @api.multi
    def get_modifiers_backend_all_models(self, model_values, config_id=None):
        _logger.info('--> BEGIN get_modifiers_backend_all_models')
        results = {}
        for model, write_date in model_values.items():
            values = self.get_modifiers_backend(write_date, model, config_id)
            results[model] = values
        _logger.info('--> END get_modifiers_backend_all_models')
        return results

    @api.model
    def get_onhand_by_product_id(self, product_id):
        values = {}
        product_object = self.env['product.product'].sudo()
        location_object = self.env['stock.location'].sudo()
        locations = location_object.search([('usage', '=', 'internal')])
        for location in locations:
            datas = product_object.with_context({'location': location.id}).search_read(
                [('id', '=', product_id)],
                ['qty_available'])
            for data in datas:
                values[location.id] = data
        return values

    def get_fields_by_model(self, model_name):
        params = self.env['ir.config_parameter'].sudo().get_param(model_name)
        if not params:
            list_fields = self.env[model_name].sudo().fields_get()
            fields_load = []
            for k, v in list_fields.items():
                if v['type'] not in ['one2many', 'binary']:
                    fields_load.append(k)
            return fields_load
        else:
            params = ast.literal_eval(params)
            return params.get('fields', [])

    @api.multi
    def get_domain_by_model(self, model_name):
        params = self.env['ir.config_parameter'].sudo().get_param(model_name)
        if not params:
            return []
        else:
            params = ast.literal_eval(params)
            return params.get('domain', [])

    @api.multi
    def install_data(self, model_name=None, min_id=0, max_id=1999):  # method install pos datas
        self.env.cr.execute(
            "select id, call_results from pos_call_log where min_id=%s and max_id=%s and call_model='%s'" % (
                min_id, max_id, model_name))
        old_logs = self.env.cr.fetchall()
        datas = {}
        if len(old_logs) == 0:
            cache_obj = self.sudo()
            log_obj = self.env['pos.call.log'].sudo()
            domain = [('id', '>=', min_id), ('id', '<=', max_id)]
            if model_name == 'product.product':
                domain.append(('available_in_pos', '=', True))
                domain.append(('sale_ok', '=', True))
            if model_name == 'res.partner':
                domain.append(('customer', '=', True))
            field_list = cache_obj.get_fields_by_model(model_name)
            datas = self.env[model_name].sudo().search_read(domain, field_list)
            version_info = odoo.release.version_info[0]
            if version_info in [12]:
                datas = log_obj.covert_datetime(model_name, datas)
            vals = {
                'active': True,
                'min_id': min_id,
                'max_id': max_id,
                'call_fields': json.dumps(field_list),
                'call_results': json.dumps(datas),
                'call_model': model_name,
                'call_domain': json.dumps(domain),
            }
            log_obj.create(vals)
            self.env.cr.commit()
        else:
            datas = old_logs[0][1]
        return datas

    def reformat_datetime(self, data, model):
        version_info = odoo.release.version_info[0]
        if version_info == 12:
            all_fields = self.env[model].fields_get()
            for field, value in data.items():
                if field == 'model':
                    continue
                if all_fields[field] and all_fields[field]['type'] in ['date', 'datetime'] and value:
                    data[field] = value.strftime(DEFAULT_SERVER_DATETIME_FORMAT)
        return data

    @api.model
    def insert_data(self, model, record_id):
        if type(model) == list:
            return False
        last_caches = self.search([('res_id', '=', str(record_id)), ('res_model', '=', model)], limit=1)
        if last_caches:
            last_caches.write({
                'res_model': model,
                'deleted': False
            })
        else:
            self.create({
                'res_id': str(record_id),
                'res_model': model,
                'deleted': False
            })
        return True

    @api.multi
    def get_data(self, model, record_id, config_id=None):
        _logger.info('--> begin get_data() id %s of model %s of config %s' % (record_id, model, config_id))
        data = {
            'model': model
        }
        fields_sale_load = self.sudo().get_fields_by_model(model)
        vals = {}
        if model == 'pos.order':
            vals = self.env[model].sudo().search_read(
                [
                    ('id', '=', record_id),
                    ('config_id', '=', config_id)
                ],
                fields_sale_load)
        if model == 'pos.order.line':
            vals = self.env[model].sudo().search_read(
                [
                    ('id', '=', record_id),
                    ('order_id.config_id', '=', config_id)
                ],
                fields_sale_load)
        if model == 'account.invoice':
            vals = self.env[model].sudo().search_read(
                [
                    ('id', '=', record_id),
                    ('pos_config_id', '=', config_id)
                ],
                fields_sale_load)
        if model == 'account.invoice.line':
            vals = self.env[model].sudo().search_read(
                [
                    ('id', '=', record_id),
                    ('invoice_id.pos_config_id', '=', config_id)
                ],
                fields_sale_load)
        if model not in ['pos.order', 'pos.order.line', 'account.invoice', 'account.invoice.line']:
            vals = self.env[model].sudo().search_read(
                [
                    ('id', '=', record_id),
                ],
                fields_sale_load)
        if vals:
            data.update(vals[0])
            data = self.reformat_datetime(data, model)
            return data
        else:
            return None

    @api.multi
    def remove_record(self, model, record_id):
        records = self.sudo().search([('res_id', '=', str(record_id)), ('res_model', '=', model)])
        if records:
            records.write({
                'deleted': True,
            })
        else:
            vals = {
                'res_id': str(record_id),
                'res_model': model,
                'deleted': True,
            }
            self.create(vals)
        return True

    @api.multi
    def save_parameter_models_load(self, model_datas):
        reinstall = False
        for model_name, value in model_datas.items():
            params = self.env['ir.config_parameter'].sudo().get_param(model_name)
            if params:
                params = ast.literal_eval(params)
                try:
                    if params.get('fields', []) != value.get('fields', []) or params.get('domain', []) != value.get(
                            'domain', []) or params.get('context', []) != value.get('context', []):
                        self.env['ir.config_parameter'].sudo().set_param(model_name, value)
                        self.env['pos.call.log'].sudo().search([]).unlink()
                        reinstall = True
                except:
                    pass
            else:
                self.env['ir.config_parameter'].sudo().set_param(model_name, value)
        return reinstall
