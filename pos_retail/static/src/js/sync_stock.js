odoo.define('pos_retail.sync_stock', function (require) {
    var models = require('point_of_sale.models');
    var rpc = require('pos.rpc');

    var _super_posmodel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        _do_update_quantity_onhand: function (product_ids) {
            var def = new $.Deferred();
            var location = this.get_location() || null;
            if (!location) {
                return
            }
            var location_id = location['id'];
            var self = this;
            rpc.query({
                model: 'stock.move',
                method: 'get_stock_datas',
                args: [location_id, product_ids],
                context: {}
            }).then(function (datas) {
                var products = [];
                for (var product_id in datas) {
                    var product = self.db.product_by_id[product_id];
                    if (product) {
                        products.push(product);
                        var qty_available = datas[product_id];
                        self.db.stock_datas[product['id']] = qty_available;
                        console.log('-> ' + product['display_name'] + ' qty_available : ' + qty_available)
                    }
                }
                if (products.length) {
                    self.gui.screen_instances["products"].do_update_products_cache(products);
                    self.gui.screen_instances["products_operation"].refresh_screen();
                }
                return def.resolve()
            }).fail(function (error) {
                return def.resolve(error);
            });
            return def;
        },
        _save_to_server: function (orders, options) {
            var self = this;
            var res = _super_posmodel._save_to_server.call(this, orders, options);
            if (!this.product_need_update_stock_ids) {
                this.product_need_update_stock_ids = [];
            }
            if (orders.length) {
                for (var n = 0; n < orders.length; n++) {
                    var order = orders[n]['data'];
                    for (var i = 0; i < order.lines.length; i++) {
                        var line = order.lines[i][2];
                        var product_id = line['product_id'];
                        var product = this.db.get_product_by_id(product_id);
                        if (product.type == 'product') {
                            this.product_need_update_stock_ids.push(product_id);
                        }
                    }
                }
            }
            res.done(function (order_ids) {
                if (self.product_need_update_stock_ids.length) {
                    self._do_update_quantity_onhand(self.product_need_update_stock_ids).done(function () {
                        self.product_need_update_stock_ids= [];
                    });
                }
            });
            return res;
        },
    });

});
