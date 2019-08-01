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
            this.pos.sync_datas = 0;
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
                    if (channel == 'pos.sync.backend' && this.pos.config.big_datas) {
                        this.pos.sync_datas += 1;
                        this.pos.set('sync_backend', {state: 'connecting', pending: this.pos.sync_datas});
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
                var sync_datas = self.pos.sync_datas;
                if (sync_datas) {
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
                    for (index in list_model) {
                        self.pos.get_modifiers_backend(list_model[index]);
                    }
                    self.pos.sync_datas = 0;
                    self.pos.set('sync_backend', {state: 'connected', pending: 0});
                } else {
                    return self.pos.gui.show_popup('dialog', {
                        title: 'Alert',
                        body: 'Nothing datas sync with backend'
                    });
                }
            });
        },
    });

    chrome.Chrome.include({
        build_widgets: function () {
            this.widgets.push(
                {
                    'name': 'sync_backend_status',
                    'widget': sync_backend_status,
                    'append': '.pos-branding'
                }
            );
            this._super();
            for (var model in this.pos.init_sync_datas) {
                var results = this.pos.init_sync_datas[model];
                this.pos.sync_with_backend(model, results);
            }
            this.pos.init_sync_datas = {};
        }
    });

    var _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        load_server_data: function () {
            var self = this;
            return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                self.pos_sync_backend = new exports.pos_sync_backend(self);
                self.pos_sync_backend.start();
                return true;
            })
        },
        sync_with_backend: function (model, datas) {
            datas = this.db.filter_datas_notifications_with_current_date(model, datas);
            if (datas.length == 0) {
                console.warn('Data sync is old times. Reject:' + model);
                return false;
            }
            console.log('New from model:' + model);
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
                if (order_ids && order_ids.length) {
                    self.sync_datas += 1;
                    self.set('sync_backend', {state: 'connecting', pending: self.sync_datas});
                    self.gui.chrome.widget['sync_backend_status'].el.click();
                }
            });
            return res;
        },
    });
});
