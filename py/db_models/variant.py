from sqlalchemy import UniqueConstraint

from globals import db

class ResourceAccount(db.Model):
    __tablename__ = 'resource_account'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    resource_id = db.Column(db.Integer, db.ForeignKey('resource.id', use_alter=True), nullable=False)
    resource = db.relation('Resource', foreign_keys=resource_id, backref=db.backref("accounts",cascade="all, delete",
        passive_deletes=True))

    pass_part = db.Column(db.String(128))
    human_readable = db.Column(db.String(256))
    revision = db.Column(db.String(256))
    lasthash = db.Column(db.String(32))
    last_used_on = db.Column(db.DateTime)
    __table_args__ = (UniqueConstraint("resource_id", "human_readable", name="name"),)


class Resource(db.Model):
    __tablename__ = 'resource'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    login_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    login = db.relation('User', foreign_keys=login_id)
    last_account_id = db.Column(db.Integer, db.ForeignKey('resource_account.id'))

    last_account = db.relation('ResourceAccount', foreign_keys=last_account_id)

    name = db.Column(db.String(256), nullable=False)
    url = db.Column(db.String(256))
    comment = db.Column(db.String(4096))

    length = db.Column(db.Integer, nullable=False)
    letters = db.Column(db.Boolean, nullable=False)
    digits = db.Column(db.Boolean, nullable=False)
    symbols = db.Column(db.Boolean, nullable=False)
    underscore = db.Column(db.Boolean, nullable=False)

