odoo.define('pos_retail.pos_chanel', function (require) {
    var models = require('point_of_sale.models');
    var indexed_db = require('pos_retail.indexedDB');
    var chrome = require('point_of_sale.chrome');
    var exports = {};
    var Backbone = window.Backbone;
    var bus = require('pos_retail.core_bus');
    var rpc = require('pos.rpc');

    exports.pos_sync_backend = Backbone.Model.extend({
        initialize: function (pos) {
            this.pos = pos;
        },
        start: function () {
            this.bus = bus.bus;
            this.bus.last = this.pos.db.load('bus_last', 0);
            this.bus.on("notification", this, this.on_notification);
            this.bus.start_polling();
        },
        on_notification: function (notifications) {
            if (notifications && notifications[0] && notifications[0][1]) {
                for (var i = 0; i < notifications.length; i++) {
                    var channel = notifications[i][0][1];
                    if (channel == 'pos.sync.backend') {
                        var values = notifications[i][1];
                        for (var model in values) {
                            var vals = values[model];
                            if (vals.length != 0) {
                                console.log('-> ' + model + ' sync ' + vals.length + ' rows !');
                                this.pos.sync_with_backend(model, vals)
                            }
                        }
                    }
                }
            }
        }
    });

    var sync_backend_status = chrome.StatusWidget.extend({
        template: 'sync_backend_status',
        start: function () {
            var self = this;
            this.pos.bind('change:sync_backend', function (pos, sync_backend) {
                self.set_status(sync_backend.state, sync_backend.pending);
            });
            this.$el.click(function () {
                var list_model = [
                    'sale.order',
                    'sale.order.line',
                    'product.product',
                    'res.partner',
                    'pos.order',
                    'pos.order.line',
                    'account.invoice',
                    'account.invoice.line',
                ];
                self.pos.get_modifiers_backend_all_models(list_model).done(function () {
                    self.pos.set('sync_backend', {state: 'connected', pending: 0});
                });
            });
        },
    });

    chrome.Chrome.include({
        build_widgets: function () {
            if (this.pos.config.big_datas) {
                this.widgets.push(
                    {
                        'name': 'sync_backend_status',
                        'widget': sync_backend_status,
                        'append': '.pos-branding'
                    }
                );
            }
            this._super();
        }
    });

    var _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        load_server_data: function () {
            var self = this;
            return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                if (self.config.big_datas) {
                    self.pos_sync_backend = new exports.pos_sync_backend(self);
                    self.pos_sync_backend.start();
                }
                return true;
            })
        },
        sync_with_backend: function (model, datas, dont_check_write_time) {
            // -----------------------------------------------------------
            // -------------------- We blocked this code -----------------
            // -----------------------------------------------------------
            // if (!dont_check_write_time || dont_check_write_time == undefined) {
            //     datas = this.db.filter_datas_notifications_with_current_date(model, datas);
            // }
            // -----------------------------------------------------------
            // -----------------------------------------------------------
            // -----------------------------------------------------------
            var self = this;
            $('.loader').animate({opacity: 1,}, 200, 'swing', function () {
                $('.loader').removeClass('oe_hidden');
                $('.loader-feedback').removeClass('oe_hidden');
                self.chrome.loading_message(('Waiting few seconds, pos auto sync ' + datas.length + ' of model: ' + model), 0.9);
            });
            if (datas.length == 0) {
                console.warn('Data sync is old times. Reject:' + model);
                return false;
            }
            this.db.set_last_write_date_by_model(model, datas);
            if (model == 'pos.order') {
                this.db.save_pos_orders(datas);
            }
            if (model == 'pos.order.line') {
                this.db.save_pos_order_line(datas);
            }
            if (model == 'account.invoice') {
                this.db.save_invoices(datas);
            }
            if (model == 'account.invoice.line') {
                this.db.save_invoice_lines(datas);
            }
            if (model == 'sale.order') {
                this.db.save_sale_orders(datas);
            }
            if (model == 'sale.order.line') {
                this.db.save_sale_order_lines(datas);
            }
            if (model == 'res.partner') {
                this.db.add_partners(datas);
                if (this.gui.screen_instances && this.gui.screen_instances['products']) {
                    this.gui.screen_instances["products"].apply_quickly_search_partners();
                }
            }
            if (model == 'product.product') {
                var product_datas = [];
                for (var i = 0; i < datas.length; i++) {
                    var data = datas[i];
                    if (data['deleted']) {
                        continue
                    } else {
                        product_datas.push(data)
                    }
                }
                if (product_datas.length) {
                    if (this.gui.screen_instances && this.gui.screen_instances['products']) {
                        this.gui.screen_instances["products"].do_update_products_cache(product_datas);
                    }
                    if (this.gui.screen_instances && this.gui.screen_instances['products_operation']) {
                        this.gui.screen_instances["products_operation"].refresh_screen();
                    }
                }
            }
            for (var i = 0; i < datas.length; i++) {
                var data = datas[i];
                if (!data['deleted'] || data['deleted'] == false) {
                    indexed_db.write(model, [data]);
                } else {
                    indexed_db.unlink(model, data);
                    if (model == 'res.partner') {
                        this.remove_partner_deleted_outof_orders(data['id'])
                    }
                }
            }
            this.chrome.loading_message('Sync done !');
            $('.loader').animate({opacity: 0,}, 200, 'swing', function () {
                $('.loader').addClass('oe_hidden');
                $('.loader-feedback').addClass('oe_hidden');

            });
        },
        remove_partner_deleted_outof_orders: function (partner_id) {
            var orders = this.get('orders').models;
            var order = orders.find(function (order) {
                var client = order.get_client();
                if (client && client['id'] == partner_id) {
                    return true;
                }
            });
            if (order) {
                order.set_client(null)
            }
            return order;
        },
        _save_to_server: function (orders, options) {
            var self = this;
            var res = _super_PosModel._save_to_server.call(this, orders, options);
            res.done(function (order_ids) {
                if (order_ids.length && self.config.big_datas) {
                    self.gui.chrome.widget['sync_backend_status'].el.click();
                }
            });
            return res;
        },
    });
});
