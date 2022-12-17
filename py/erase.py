

from globals import app, db
f = open("erase.sql", "r")
erase_query = f.read()
db.engine.execute(erase_query)
print("DB erased.")