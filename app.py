import os
import webview 

class API:
    def __init__(self):
        self.window = None 

    
if __name__ == '__main__':
    api = API()
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    INDEX_HTML = os.path.join(BASE_DIR, 'template', 'index.html')

    window = webview.create_window('Management System', INDEX_HTML,js_api=api,width=1024,height=768,fullscreen=True,min_size=(450, 600))
    api.window = window
    webview.start()