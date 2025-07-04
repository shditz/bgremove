#performance_config.py

import os
import torch


os.environ['OMP_NUM_THREADS'] = '4'  
os.environ['MKL_NUM_THREADS'] = '4'  
os.environ['NUMEXPR_NUM_THREADS'] = '4'  


torch.set_num_threads(4)  
torch.backends.cudnn.benchmark = True  


MEMORY_SETTINGS = {
    'max_image_size': {
        'standard': 512,
        'high': 768,
        'ultra': 1024
    },
    'cleanup_interval': 5,  
    'batch_size': 1,  
    'enable_mixed_precision': True,  
}


MODEL_PRIORITY = {
    'fast': 'u2netp',
    'balanced': 'u2net', 
    'accurate': 'isnet-general-use'
}


IMAGE_PROCESSING = {
    'use_opencv_resize': True, 
    'jpeg_quality': 85, 
    'enable_threading': True,  
    'max_workers': 2,  
}


PREPROCESSING = {
    'skip_denoising': True, 
    'simple_enhancement': True, 
    'fast_edge_detection': True,  
}

def get_optimal_settings(image_size, quality='standard'):
    """Mendapatkan setting optimal berdasarkan ukuran gambar dan kualitas"""
    width, height = image_size
    total_pixels = width * height
    
    settings = {
        'resize_needed': False,
        'target_size': None,
        'model': MODEL_PRIORITY['balanced'],
        'preprocessing': 'minimal'
    }
    

    max_size = MEMORY_SETTINGS['max_image_size'][quality]
    if max(width, height) > max_size:
        settings['resize_needed'] = True
        settings['target_size'] = max_size
    
  
    if total_pixels < 500000:  
        settings['model'] = MODEL_PRIORITY['fast']
    elif total_pixels < 2000000: 
        settings['model'] = MODEL_PRIORITY['balanced']
    else: 
        settings['model'] = MODEL_PRIORITY['accurate']
    
  
    if quality == 'standard':
        settings['preprocessing'] = 'minimal'
    elif quality == 'high':
        settings['preprocessing'] = 'moderate'
    else:  
        settings['preprocessing'] = 'enhanced'
    
    return settings

def setup_memory_optimization():
    """Setup optimasi memory"""
    import gc
    

    gc.collect()
    

    gc.set_threshold(700, 10, 10)
    

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.memory_fraction = 0.8  
    
    print("Memory optimization setup completed")


def performance_monitor(func):
    """Decorator untuk monitoring performa function"""
    import time
    import psutil
    import functools
    
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        start_memory = psutil.Process().memory_info().rss / 1024 / 1024  
        
        result = func(*args, **kwargs)
        
        end_time = time.time()
        end_memory = psutil.Process().memory_info().rss / 1024 / 1024 
        
        print(f"Function {func.__name__}:")
        print(f"  Time: {end_time - start_time:.2f}s")
        print(f"  Memory: {end_memory - start_memory:.2f}MB")
        print(f"  Total Memory: {end_memory:.2f}MB")
        
        return result
    
    return wrapper


request_counter = 0

def should_cleanup():
    """Tentukan apakah perlu cleanup memory"""
    global request_counter
    request_counter += 1
    return request_counter % MEMORY_SETTINGS['cleanup_interval'] == 0


def get_system_status():
    """Dapatkan status sistem"""
    import psutil
    
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    
    status = {
        'cpu_usage': cpu_percent,
        'memory_usage': memory.percent,
        'memory_available': memory.available / 1024 / 1024 / 1024,  
        'can_process': cpu_percent < 80 and memory.percent < 85
    }
    
    if torch.cuda.is_available():
        gpu_memory = torch.cuda.memory_allocated() / 1024 / 1024 / 1024  
        gpu_memory_total = torch.cuda.memory_reserved() / 1024 / 1024 / 1024  
        
        status.update({
            'gpu_memory_used': gpu_memory,
            'gpu_memory_total': gpu_memory_total,
            'gpu_memory_percent': (gpu_memory / gpu_memory_total * 100) if gpu_memory_total > 0 else 0
        })
    
    return status

if __name__ == '__main__':
    setup_memory_optimization()
    print("Performance configuration loaded")
    print(f"System status: {get_system_status()}")