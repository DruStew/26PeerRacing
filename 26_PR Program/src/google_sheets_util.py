import os.path
import logging as log
import util
import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# If modifying these scopes, delete the file token.json.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
WRITE_SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

#https://docs.google.com/spreadsheets/d/1WO3Ji6fIyP8_bfo-W5-mvtaGa8s8N4Epnn6vUDwH-MI/edit?usp=sharing

# The ID and range of a sample spreadsheet.
SAMPLE_SPREADSHEET_ID = "1WO3Ji6fIyP8_bfo-W5-mvtaGa8s8N4Epnn6vUDwH-MI"
SAMPLE_RANGE_NAME = "Sheet2!A1:I"

WRITE_TOKEN_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),'write_token.json')
READ_TOKEN_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),'read_token.json')

def find_client_secret_path(dir='client_secret'):
	search_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),dir)
	try:
		for file in os.listdir(search_path):
			path = os.path.join(search_path, file)
			to_return = util.safe_load_json(path)
			if (to_return is not None):
				log.debug('client secrete found at %s' % (path,))
				return path
	except BaseException as ex:
		log.warning('find_client_secret_path() failed')
		log.warning(ex)
	return None

def create_creds(scopes, token_path):
	path = find_client_secret_path()
	flow = InstalledAppFlow.from_client_secrets_file(path, scopes)
	creds = flow.run_local_server(port=0)

	with open(token_path, "w") as token: # Save the credentials for the next run
		token.write(creds.to_json())

def get_creds(scopes, token_path):
	creds = None
	if (not os.path.exists(token_path)):
		create_creds(scopes, token_path)
	creds = Credentials.from_authorized_user_file(token_path, scopes)
	return creds

def read_sheet(sheet_id, tab="Sheet1", range="A1:I", scopes=SCOPES, token_path=READ_TOKEN_PATH):
	creds = get_creds(scopes, token_path)
	try:
		service = build("sheets", "v4", credentials=creds)

		sheet = service.spreadsheets() # Call the Sheets API
		result = sheet.values().get(spreadsheetId=sheet_id, range='%s!%s'%(tab,range)).execute()
		values = result.get("values", [])
		return values


	except HttpError as ex:
		log.error('google_sheets_util.read_sheet() failed')
		log.error(ex)
		return None

def write_sheet(sheet_id, values, tab="Sheet2", range="A1:I", value_input_option="USER_ENTERED", scopes=WRITE_SCOPES, token_path=WRITE_TOKEN_PATH):
	creds = get_creds(scopes, token_path)
	try:
		service = build("sheets", "v4", credentials=creds)
		current_values = service.spreadsheets().values()
		body = {"values": values}
		
		result = current_values.update(spreadsheetId=sheet_id, range='%s!%s'%(tab,range), valueInputOption=value_input_option, body=body).execute()
		log.debug(result)
		return True
	except HttpError as ex:
		log.error('google_sheets_util.write_sheet() failed')
		log.error(ex)
		return False

##add a tab to an existing spreadsheet
def add_sheets(sheet_id, new_sheet_name=['Sheet3'], scopes=WRITE_SCOPES, token_path=WRITE_TOKEN_PATH):
	creds = get_creds(scopes, token_path)
	try:
		service = build("sheets", "v4", credentials=creds)
		requests = []
		for sheet in new_sheet_name:
			requests.append({"addSheet": {"properties": {"title": sheet}}})

		body = {"requests": requests}
		response = service.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body=body).execute()
		return response.get("replies")

	except HttpError as ex:
		log.error('google_sheets_util.add_sheet() failed!')
		log.error(ex)
		return False

def sheet_exists(sheet_id, tab, scopes=WRITE_SCOPES, token_path=WRITE_TOKEN_PATH):
	creds = get_creds(scopes, token_path)
	try:
		service = build("sheets", "v4", credentials=creds)

		sheet = service.spreadsheets() # Call the Sheets API
		result = sheet.values().get(spreadsheetId=sheet_id, range='%s!A1:A1'%(tab,)).execute()
		#values = result.get("values", [])
		return True
	except HttpError as ex:
		return False

def clear_sheet(sheet_id, tab="Sheet2", range="A1:I", value_input_option="USER_ENTERED", scopes=WRITE_SCOPES, token_path=WRITE_TOKEN_PATH):
	creds = get_creds(scopes, token_path)
	try:
		service = build("sheets", "v4", credentials=creds)
		result = service.spreadsheets().values().clear(spreadsheetId=sheet_id, range='%s!%s'%(tab,range)).execute()
		log.debug(result)
		return True
	except HttpError as ex:
		log.error('google_sheets_util.write_sheet() failed')
		log.error(ex)
		return False

##add a tab to an existing spreadsheet
def delete_sheets(sheet_id, tabs=['Sheet3'], scopes=WRITE_SCOPES, token_path=WRITE_TOKEN_PATH):
	creds = get_creds(scopes, token_path)
	try:
		service = build("sheets", "v4", credentials=creds)

		sheet = service.spreadsheets() # Call the Sheets API
		result = sheet.get(spreadsheetId=sheet_id).execute()
		#print(result['sheets'])
		requests = []
		for sheet in result['sheets']:
			if (sheet['properties']['title'] in tabs):
				requests.append({"deleteSheet": {"sheetId": sheet['properties']['sheetId']}})
		service = build("sheets", "v4", credentials=creds)
		response = service.spreadsheets().batchUpdate(spreadsheetId=sheet_id, body={"requests": requests}).execute()
		return response.get("replies")
	except HttpError as ex:
		log.error('google_sheets_util.write_sheet() failed')
		log.error(ex)
		return False

if __name__ == "__main__":
	log.basicConfig(level=log.DEBUG)
	
	values = read_sheet(SAMPLE_SPREADSHEET_ID)
	#print(values)
	for row in values:
		log.info(row)
	
	values = [
		["peer racing ID 1", 1,	"first", "last", 64, "F", "1:00:18"]
	]
		
	rc = write_sheet(SAMPLE_SPREADSHEET_ID, values)
	
	delete_sheets(SAMPLE_SPREADSHEET_ID, tabs=['Sheet4'])
	rc = add_sheets(SAMPLE_SPREADSHEET_ID, new_sheet_name=['Sheet4'])
	log.info(rc)
