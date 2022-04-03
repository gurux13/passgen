from globals import db

class ResourceAccount(db.Model):
    __tablename__ = 'resource_account'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    pass_part = db.Column(db.String(128))
    human_readable = db.Column(db.String(256))
    length = db.Column(db.Integer)
    letters = db.Column(db.Boolean)
    digits = db.Column(db.Boolean)
    symbols = db.Column(db.Boolean)
    underscore = db.Column(db.Boolean)
    revision = db.Column(db.String(256))

class Resouce(db.Model):
    __tablename__ = 'resource'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    login_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    login = db.relation('User', foreign_keys=login_id)
    resource = db.Column(db.String(256))
    url = db.Column(db.String(256))
    comment = db.Column(db.String(4096))

