from globals import db

class ResourceVariation(db.Model):
    __tablename__ = 'resource_vaiants'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    pass_part = db.Column(db.String(128))
    human_readable = db.Column(db.String(256))
    length = db.Column(db.Integer)
    letters = db.Column(db.Boolean)
    digits = db.Column(db.Boolean)
    symbols = db.Column(db.Boolean)
    underscore = db.Column(db.Boolean)
    revision = db.Column(db.String)

class Resouce(db.Model):
    __tablename__ = 'variants'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    login_id = db.Column(db.Integer)
    resource = db.Column(db.String(256))
