from sqlalchemy.sql import text
import os
fname = os.environ['SCRIPT']
from globals import app, db
f = open(fname, "r")
query = f.read()
conn = db.engine.connect()
conn.execute(text(query)).close()
print("Query", fname, "succeeded")
