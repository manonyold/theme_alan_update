"use strict";
odoo.define('pos_retail.screen_client_list', function (require) {

    var screens = require('point_of_sale.screens');
    var core = require('web.core');
    var qweb = core.qweb;

    screens.ClientListScreenWidget.include({
        init: function (parent, options) {
            this._super(parent, options);
            var self = this;
            this.pos.bind('client:save_changes', function () {
                self.save_changes();
            });
        },
        refresh_screen: function () {
            var self = this;
            this.pos.get_modifiers_backend('res.partner').then(function () {
                self.pos.trigger('refresh:partner_screen');
            });
        },
        start: function () {
            var self = this;
            this._super();
            this.pos.bind('refresh:partner_screen', function () {
                var partners = self.pos.db.get_partners_sorted(100);
                self.re_render_list(partners);
            });
        },
        re_render_list: function (partners) {
            var contents = this.$el[0].querySelector('.client-list-contents');
            contents.innerHTML = "";
            for (var i = 0, len = Math.min(partners.length, 1000); i < len; i++) {
                var partner = partners[i];
                if (!partner) {
                    continue
                }
                var clientline_html = qweb.render('ClientLine', {widget: this, partner: partner});
                var clientline = document.createElement('tbody');
                clientline.innerHTML = clientline_html;
                clientline = clientline.childNodes[1];
                this.partner_cache.cache_node(partner.id, clientline);
                if (partner === this.old_client) {
                    clientline.classList.add('highlight');
                } else {
                    clientline.classList.remove('highlight');
                }
                contents.appendChild(clientline);
            }
        },
        display_client_details: function (visibility, partner, clickpos) { // TODO: we add input type date to box birth day of client edit
            this._super(visibility, partner, clickpos);
            this.$('.datepicker').datetimepicker({
                format: 'YYYY-MM-DD',
                icons: {
                    time: "fa fa-clock-o",
                    date: "fa fa-calendar",
                    up: "fa fa-chevron-up",
                    down: "fa fa-chevron-down",
                    previous: 'fa fa-chevron-left',
                    next: 'fa fa-chevron-right',
                    today: 'fa fa-screenshot',
                    clear: 'fa fa-trash',
                    close: 'fa fa-remove'
                }
            });
        },
        show: function () {
            var self = this;
            this.search_partners = [];
            this._super();
            var $search_box = $('.clientlist-screen .searchbox >input');
            $search_box.autocomplete({
                source: this.pos.db.get_partners_source(),
                minLength: this.pos.config.min_length_search,
                select: function (event, ui) {
                    if (ui && ui['item'] && ui['item']['value']) {
                        var partner = self.pos.db.partner_by_id[parseInt(ui['item']['value'])];
                        if (partner) {
                            self.pos.get_order().set_client(partner);
                            self.pos.gui.back();
                        }
                        setTimeout(function () {
                            self.clear_search()
                        }, 2000);

                    }
                }
            });
            this.$('.only_customer').click(function () {
                self.pos.only_customer = !self.pos.only_customer;
                self.pos.only_supplier = !self.pos.only_customer;
                if (self.pos.only_customer) {
                    self.$('.only_customer').addClass('highlight');
                    self.$('.only_supplier').removeClass('highlight');
                } else {
                    self.$('.only_customer').removeClass('highlight');
                    self.$('.only_supplier').addClass('highlight');
                }
                var partners = self.pos.db.get_partners_sorted(1000);
                self.render_list(partners);
            });
            this.$('.only_supplier').click(function () {
                self.pos.only_supplier = !self.pos.only_supplier;
                self.pos.only_customer = !self.pos.only_supplier;
                if (self.pos.only_supplier) {
                    self.$('.only_supplier').addClass('highlight');
                    self.$('.only_customer').removeClass('highlight');
                } else {
                    self.$('.only_supplier').removeClass('highlight');
                    self.$('.only_customer').addClass('highlight');
                }
                var partners = self.pos.db.get_partners_sorted(1000);
                self.render_list(partners);
            });
            this.$('.back').click(function () {
                self.pos.trigger('back:order');
            });
            this.$('.next').click(function () {
                self.pos.trigger('back:order');
            });
            this.$('.sort_by_id').click(function () {
                if (self.search_partners.length == 0) {
                    var partners = self.pos.db.get_partners_sorted(1000).sort(self.pos.sort_by('id', self.reverse, parseInt));
                    self.render_list(partners);
                    self.reverse = !self.reverse;
                } else {
                    self.search_partners = self.search_partners.sort(self.pos.sort_by('id', self.reverse, parseInt));
                    self.render_list(self.search_partners);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_name').click(function () {
                if (self.search_partners.length == 0) {
                    var partners = self.pos.db.get_partners_sorted(1000).sort(self.pos.sort_by('name', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_list(partners);
                    self.reverse = !self.reverse;
                } else {
                    self.search_partners = self.search_partners.sort(self.pos.sort_by('name', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_list(self.search_partners);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_address').click(function () {
                if (self.search_partners.length == 0) {
                    var partners = self.pos.db.get_partners_sorted(1000).sort(self.pos.sort_by('name', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_list(partners);
                    self.reverse = !self.reverse;
                } else {
                    self.search_partners = self.search_partners.sort(self.pos.sort_by('name', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_list(self.search_partners);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_phone').click(function () {
                if (self.search_partners.length == 0) {
                    var partners = self.pos.db.get_partners_sorted(1000).sort(self.pos.sort_by('phone', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_list(partners);
                    self.reverse = !self.reverse;
                } else {
                    self.search_partners = self.search_partners.sort(self.pos.sort_by('phone', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_list(self.search_partners);
                    self.reverse = !self.reverse;
                }
            });
            this.$('.sort_by_mobile').click(function () {
                if (self.search_partners.length == 0) {
                    var partners = self.pos.db.get_partners_sorted(1000).sort(self.pos.sort_by('mobile', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_list(partners);
                    self.reverse = !self.reverse;
                } else {
                    self.search_partners = self.search_partners.sort(self.pos.sort_by('mobile', self.reverse, function (a) {
                        if (!a) {
                            a = 'N/A';
                        }
                        return a.toUpperCase()
                    }));
                    self.render_list(self.search_partners);
                    self.reverse = !self.reverse;
                }
            });
        },
        render_list: function (partners) {
            if (this.pos.only_customer) {
                var partners = _.filter(partners, function (partner) {
                    return partner['customer'] == true;
                });
                return this._super(partners);
            }
            if (this.pos.only_supplier) {
                var partners = _.filter(partners, function (partner) {
                    return partner['supplier'] == true;
                });
                return this._super(partners);
            }
            return this._super(partners);
        },
        clear_search: function () {
            return this._super();
        },
        save_client_details: function (partner) {
            var id = partner.id || false;
            var fields = {};
            this.$('.client-details-contents .detail').each(function (idx, el) {
                fields[el.name] = el.value || false;
            });
            if (this.pos.config.check_duplicate_email && fields['email']) {
                if (id) {
                    this.pos._check_unique_email(fields['email'], id)
                } else {
                    this.pos._check_unique_email(fields['email'])
                }
            }
            if (this.pos.config.check_duplicate_phone && fields['phone']) {
                if (id) {
                    this.pos._check_unique_phone(fields['phone'], id)
                } else {
                    this.pos._check_unique_phone(fields['phone'])
                }
            }
            if (this.pos.config.check_duplicate_phone && fields['mobile']) {
                if (id) {
                    this.pos._check_unique_phone(fields['mobile'], id)
                } else {
                    this.pos._check_unique_phone(fields['mobile'])
                }
            }
            return this._super(partner);
        },
    });

});
