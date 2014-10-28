activate_this = '/Users/crd/.virtualenvs/spooky/bin/activate_this.py'
execfile(activate_this, dict(__file__=activate_this))

import sys
sys.path.insert(0,'/Users/crd/Code/sunlight/spooky')

from app import app as application