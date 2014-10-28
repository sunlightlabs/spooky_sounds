from flask import Flask, render_template, session
from flask.ext.socketio import SocketIO, emit
import os
import base64
from os import path
import subprocess
import random
import threading
import string
from uuid import uuid4
from pipes import quote

# instantiate and configure app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'qw234l2elkjwerljwerlqwe'
app.debug = True
socketio = SocketIO(app)

# set up environment and variables
VOLUMES_DIR = '/Volumes'
RAMDISK = 'ramdisk'
RAMDISK_SIZE = 20480
if not path.exists(path.join(VOLUMES_DIR,RAMDISK)):
    os.system("diskutil erasevolume HFS+ '" + RAMDISK + "' `hdiutil attach -nomount ram://" + str(RAMDISK_SIZE) + "`")
SOCKET_NAMESPACE = '/spooky'
VOICE_OPTIONS = filter(None,[x.split(' ')[0] for x in os.popen('say -v ?').read().split('\n')])
print VOICE_OPTIONS
LOCK = threading.Lock()
CREEPY_THINGS_TO_SAY = ['ahhhhhhhh', 'boooooooooo', 'gahhhhhhh']
global ALL_WORDS_ENTERED
ALL_WORDS_ENTERED = []
DEFAULT_SPEED = 120

# routes and socket events

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@socketio.on('motion_detected', namespace=SOCKET_NAMESPACE)
def motion_detected(message):
    print message

    if session['locked']: return

    session['locked'] = True
    b64_data = get_base64_data(get_words(),get_speed(message),get_voice(message))
    session['locked'] = False

    if b64_data: emit('sound', {'type': 'mp3', 'data': b64_data})

@socketio.on('say_word', namespace=SOCKET_NAMESPACE)
def say_word(message):
    if len(message['data']) > 200: return

    session['locked'] = True
    b64_data = get_base64_data(get_words(message),get_speed(message),get_voice(message))
    session['locked'] = False

    if b64_data: emit('sound', {'type': 'mp3', 'data': b64_data})

@socketio.on('word_added', namespace=SOCKET_NAMESPACE)
def word_added(message):
    if len(message['data']) > 200: return
    global ALL_WORDS_ENTERED
    session['words'] += [message['data']]
    ALL_WORDS_ENTERED += [message['data']]
    emit('word_added', {'data': message['data']}, broadcast=True)

@socketio.on('word_removed', namespace=SOCKET_NAMESPACE)
def word_removed(message):
    if message['data'] in session['words']: session['words'].remove(message['data'])
    emit('word_removed', {'data': "Removed"})

@socketio.on('voice_added', namespace=SOCKET_NAMESPACE)
def voice_added(message):
    if len(message['data']) > 200: return
    print 'Adding voice: ' + message['data']
    if message['data'] not in session['voices']:
        session['voices'] += [message['data']]
        print session['voices']

@socketio.on('voice_removed', namespace=SOCKET_NAMESPACE)
def voice_removed(message):
    if len(message['data']) > 200: return
    print 'Removing voice: ' + message['data']
    if message['data'] in session['voices']:
        session['voices'].remove(message['data'])

@socketio.on('set_speed', namespace=SOCKET_NAMESPACE)
def set_speed(message):
    spd = message['data']
    if spd is None and 'speed' in session:
        session['speed'] = None
    else:
        try:
            spd = int(spd)
            if isinstance(spd,int):
                session['speed'] = spd
        except:
            return

@socketio.on('all_voices', namespace=SOCKET_NAMESPACE)
def all_voices():
    print "setting all voices"
    session['voices'] = list(VOICE_OPTIONS)

@socketio.on('clear_voices', namespace=SOCKET_NAMESPACE)
def clear_voices():
    print "clearing all voices"
    session['voices'] = []

@socketio.on('connect', namespace=SOCKET_NAMESPACE)
def connect():
    print 'Client connected'
    session['id'] = str(uuid4())
    session['words'] = []
    session['voices'] = list(VOICE_OPTIONS)
    session['locked'] = False
    session['speed'] = None
    emit('connection_response', {'data': 'Connected', 'voices': VOICE_OPTIONS, 'words' : ALL_WORDS_ENTERED})

@socketio.on('disconnect', namespace=SOCKET_NAMESPACE)
def disconnect():
    print 'Client with id ' + session['id'] + ' disconnected'

def get_base64_data(words, speed, voice):
    try:
        # generate sound file and write to ramdisk
        filename = path.join(VOLUMES_DIR, RAMDISK, ''.join(random.sample(string.ascii_lowercase, 10)))
        create_binary_data(quote(words), str(speed), quote(voice), filename)
        binaryFile = open((filename + ".mp3"), "rb")
        binaryData = binaryFile.read()
        binaryFile.close()

        # convert sound data into base64
        b64_data = base64.b64encode(binaryData)

        print "sending " + str(((len(b64_data) / 3) * 4)/1000) + " kilobytes to client with id: " + session['id']

        # cleanup file
        cmd = 'rm ' + filename + '.mp3 && rm ' + filename + '.aiff'
        p = subprocess.Popen(cmd, shell=True)
        p.wait()

        return b64_data
    except:
        print "Can't create sound for: " + words
        return False

def create_binary_data(words, speed, voice, filename):
    cmd = 'say ' + words + ' -r ' + speed + ' -v ' + voice + ' -o ' + filename + '.aiff && lame -m m ' + filename + '.aiff ' + filename + '.mp3'
    print cmd
    s = subprocess.Popen(cmd, shell=True)
    s.wait()

def get_words(message=None):
    output = ''

    if message is not None and 'data' in message:
        output = message['data']
    else:
        if len(session['words']) > 0:
            output = random.choice(session['words'])

        if not output and random.random() > 0.5:
            cmd = 'ruby faker.rb'
            p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE)
            output, errors = p.communicate()

        if not output:
            print "creepy things..."
            output = random.choice(CREEPY_THINGS_TO_SAY)

    return output

def get_speed(message):
    if 'speed' in session and isinstance(session['speed'],int):
        return session['speed']
    elif 'speed' in message and isinstance(message['speed'],int):
        return int(message['speed']*2.5)
    else:
        return DEFAULT_SPEED

def get_voice(message):
    if 'voice' in message:
        return message['voice']
    elif 'voices' in session and len(session['voices']) > 0:
        return random.choice(session['voices'])
    else:
        return random.choice(VOICE_OPTIONS)

if __name__ == '__main__':
    socketio.run(app)