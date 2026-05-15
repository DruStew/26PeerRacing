import json
import logging as log

def safe_load_json(path, silent=False):
	try:
		with open(path,'r') as f:
			return json.load(f)
	except BaseException as ex:
		log.warning('failed to open JSON file at %s' % (path,))
		log.warning(ex)
		return None