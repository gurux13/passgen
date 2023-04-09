def set_from_model(db_entity: object, model_dict: dict):
    for key, value in model_dict.items():
        db_entity.__setattr__(key, value)