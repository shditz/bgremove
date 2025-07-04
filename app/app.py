#app.py

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
from rembg import remove, new_session
import cv2
import numpy as np
import io
from PIL import Image
import logging
import os
import warnings
import torch
import gc
import threading
from concurrent.futures import ThreadPoolExecutor
import time
from functools import lru_cache

warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OptimizedBackgroundRemover:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
      
        self.primary_models = {
            'u2net': None,
            'u2netp': None,  
            'isnet-general-use': None,
        }
        
     
        self.model_lock = threading.Lock()
        self.last_used_model = None
        
     
        self.executor = ThreadPoolExecutor(max_workers=2)
   
        self.preprocess_cache = {}
        
        logger.info(f"Initialized with device: {self.device}")
    
    def get_model_session(self, model_name):
        """Lazy loading model dengan memory management"""
        with self.model_lock:
            if self.primary_models[model_name] is None:
             
                if self.last_used_model and self.last_used_model != model_name:
                    if self.primary_models[self.last_used_model] is not None:
                        del self.primary_models[self.last_used_model]
                        self.primary_models[self.last_used_model] = None
                        
                     
                        gc.collect()
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                
                logger.info(f"Loading model: {model_name}")
                self.primary_models[model_name] = new_session(model_name)
                self.last_used_model = model_name
                
            return self.primary_models[model_name]
    
    def quick_subject_detection(self, image):
        """Deteksi subjek yang lebih cepat dan efisien"""
        height, width = image.shape[:2]
        
   
        analysis_size = 256
        scale = min(analysis_size / width, analysis_size / height)
        small_img = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        
   
        gray = cv2.cvtColor(small_img, cv2.COLOR_BGR2GRAY)
        
      
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        faces = face_cascade.detectMultiScale(gray, 1.3, 5, minSize=(20, 20))
        
        if len(faces) > 0:
            return 'human_portrait', 'u2net', 0.8
        
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / (gray.shape[0] * gray.shape[1])
        
        if edge_density > 0.15:
            return 'complex_object', 'isnet-general-use', 0.6
        else:
            return 'simple_object', 'u2netp', 0.5
    
    def optimize_image_size(self, image, quality='standard'):
        """Optimasi ukuran gambar berdasarkan kualitas"""
        height, width = image.shape[:2]
        
        if quality == 'ultra':
            max_size = 1024
        elif quality == 'high':
            max_size = 768
        else:
            max_size = 512
        
      
        if max(width, height) > max_size:
            scale = max_size / max(width, height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            
       
            image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
            logger.info(f"Resized from {width}x{height} to {new_width}x{new_height}")
        
        return image
    
    def simple_preprocessing(self, image, quality='standard'):
        """Preprocessing yang lebih ringan"""
        if quality == 'standard':
            return image
        
    
        if quality in ['high', 'ultra']:
           
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            enhanced = cv2.merge([l, a, b])
            return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
        
        return image
    
    def simple_mask_refinement(self, mask, quality='standard'):
        """Refinement mask yang lebih sederhana"""
        if mask.dtype != np.uint8:
            mask = (mask * 255).astype(np.uint8)
        
        if len(mask.shape) == 3:
            mask = cv2.cvtColor(mask, cv2.COLOR_BGR2GRAY)
        
        if quality == 'standard':
           
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        else:
     
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.medianBlur(mask, 3)
        
        return mask
    
    def remove_background(self, image, quality='standard'):
        """Main function dengan optimasi performa"""
        start_time = time.time()
        
        original_height, original_width = image.shape[:2]
        logger.info(f"Processing {original_width}x{original_height} image with quality: {quality}")
        
      
        optimized_image = self.optimize_image_size(image, quality)
        
  
        subject_type, model_name, confidence = self.quick_subject_detection(optimized_image)
        logger.info(f"Detected: {subject_type} using {model_name} (confidence: {confidence:.2f})")
        
 
        processed_image = self.simple_preprocessing(optimized_image, quality)
        
  
        try:
            session = self.get_model_session(model_name)
            result = remove(processed_image, session=session)
            

            if len(result.shape) == 3 and result.shape[2] == 4:
                mask = result[:, :, 3]
            else:
        
                mask = cv2.cvtColor(result, cv2.COLOR_BGR2GRAY)
            
        except Exception as e:
            logger.error(f"Error with model {model_name}: {e}")
 
            session = self.get_model_session('u2netp')
            result = remove(processed_image, session=session)
            mask = result[:, :, 3] if result.shape[2] == 4 else cv2.cvtColor(result, cv2.COLOR_BGR2GRAY)
        

        if mask.shape != (original_height, original_width):
            mask = cv2.resize(mask, (original_width, original_height), interpolation=cv2.INTER_LINEAR)
        

        refined_mask = self.simple_mask_refinement(mask, quality)
        
   
        if len(image.shape) == 3:
            result = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
        else:
            result = image.copy()
        
        if len(result.shape) == 3:
            result = cv2.cvtColor(result, cv2.COLOR_BGR2BGRA)
        
        result[:, :, 3] = refined_mask
        
        processing_time = time.time() - start_time
        logger.info(f"Processing completed in {processing_time:.2f} seconds")
        
        return result
    
    def cleanup_memory(self):
        """Membersihkan memory secara manual"""
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


bg_remover = OptimizedBackgroundRemover()

@app.route('/remove-bg', methods=['POST'])
def remove_bg():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400

    quality = request.form.get('quality', 'standard')
    if quality not in ['standard', 'high', 'ultra']:
        quality = 'standard'
    
    try:
        img_bytes = file.read()
        img_array = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({'error': 'Invalid image format'}), 400
        
  
        result = bg_remover.remove_background(img, quality)
        
      
        _, buffer = cv2.imencode('.png', result)
        
  
        bg_remover.cleanup_memory()
        
        return send_file(
            io.BytesIO(buffer.tobytes()),
            mimetype='image/png',
            as_attachment=True,
            download_name='background_removed.png'
        )
        
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        bg_remover.cleanup_memory()
        return jsonify({'error': 'Failed to process image'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'device': str(bg_remover.device),
        'available_models': list(bg_remover.primary_models.keys()),
        'memory_optimized': True
    })

@app.route('/models', methods=['GET'])
def get_models():
    return jsonify({
        'models': {
            'u2net': 'General purpose - balanced quality/speed',
            'u2netp': 'Lightweight - fastest processing',
            'isnet-general-use': 'Complex objects - slower but accurate',
        },
        'quality_levels': {
            'standard': 'Fast processing (recommended)',
            'high': 'Better quality with moderate speed',
            'ultra': 'Best quality but slower'
        },
        'optimizations': [
            'Lazy model loading',
            'Automatic image resizing',
            'Memory cleanup after processing',
            'Single model processing (no ensemble)',
            'Simplified preprocessing'
        ]
    })

@app.route('/cleanup', methods=['POST'])
def manual_cleanup():
    """Endpoint untuk membersihkan memory secara manual"""
    try:
        bg_remover.cleanup_memory()
        return jsonify({'status': 'Memory cleaned successfully'})
    except Exception as e:
        return jsonify({'error': f'Cleanup failed: {str(e)}'}), 500

if __name__ == '__main__':
    logger.info("Starting Optimized Background Remover API 2025")
    logger.info(f"Device: {bg_remover.device}")
    logger.info("Optimizations: Lazy loading, Memory management, Simplified processing")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False,
        threaded=True
    )